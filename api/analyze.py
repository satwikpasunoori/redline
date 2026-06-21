"""
api/analyze.py

Vercel turns this into a serverless function at POST /api/analyze.
It takes a base64-encoded resume PDF (+ an optional job description),
sends it to Gemini, and returns structured feedback as JSON.

Uses only the Python standard library on purpose — no requirements.txt
needed, fewer things that can break during a deploy.
"""

import json
import os
import urllib.request
import urllib.error
from http.server import BaseHTTPRequestHandler

GEMINI_MODEL = "gemini-2.5-flash"
GEMINI_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"

PROMPT_INSTRUCTIONS = """You are an experienced technical recruiter and resume editor. Look at the attached resume (a PDF) and review it the way a sharp recruiter would in the first 30 seconds.

Return ONLY a single JSON object, with no markdown formatting and no text outside the JSON, in exactly this shape:

{
  "overall_score": 0-100 integer,
  "summary": "one or two sentence overview of how the resume reads overall",
  "sections_found": ["resume sections you detected, e.g. Contact, Summary, Experience, Education, Skills, Projects"],
  "sections_missing": ["commonly expected sections that seem to be missing or weak"],
  "formatting_flags": ["specific layout or formatting issues that could trip up an ATS or a skimming recruiter, e.g. multi-column layout, embedded photo, inconsistent dates, dense paragraphs instead of bullets"],
  "bullet_feedback": [
    {"original": "a real bullet point copied from the resume", "suggestion": "a stronger rewrite of that bullet", "reason": "why the rewrite is stronger, one short sentence"}
  ],
  "keyword_match": {"match_percentage": 0-100 integer, "matched": ["terms from the job description found in the resume"], "missing": ["important terms from the job description not found in the resume"]},
  "top_suggestions": ["3 to 5 short, specific, actionable suggestions, most important first"]
}

Pick 3 to 5 of the weakest or most improvable bullet points for bullet_feedback, not every bullet on the page.
If no job description is provided below, set "keyword_match" to null and skip keyword matching entirely.
Be specific and reference real content from the resume. Do not invent experience that isn't there.

Job description provided by the user (may be empty):
"""


class handler(BaseHTTPRequestHandler):

    def _send_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
            raw_body = self.rfile.read(length) if length else b""
            payload = json.loads(raw_body or b"{}")
        except (ValueError, json.JSONDecodeError):
            self._send_json(400, {"error": "Couldn't read the request body."})
            return

        resume_base64 = payload.get("resume_base64")
        mime_type = payload.get("mime_type") or "application/pdf"
        job_description = (payload.get("job_description") or "").strip()

        if not resume_base64:
            self._send_json(400, {"error": "No resume file was received."})
            return

        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            self._send_json(500, {"error": "Server is missing GEMINI_API_KEY. Add it in your Vercel project's environment variables."})
            return

        prompt_text = PROMPT_INSTRUCTIONS + (job_description or "(none provided — skip keyword_match and set it to null)")

        gemini_request = {
            "contents": [{
                "parts": [
                    {"inline_data": {"mime_type": mime_type, "data": resume_base64}},
                    {"text": prompt_text},
                ]
            }],
            "generationConfig": {
                "response_mime_type": "application/json",
                "temperature": 0.4,
            },
        }

        req = urllib.request.Request(
            f"{GEMINI_URL}?key={api_key}",
            data=json.dumps(gemini_request).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        try:
            with urllib.request.urlopen(req, timeout=25) as resp:
                gemini_response = json.loads(resp.read())
        except urllib.error.HTTPError as e:
            detail = e.read().decode("utf-8", errors="ignore")[:300]
            self._send_json(502, {"error": f"Gemini API returned an error ({e.code}): {detail}"})
            return
        except Exception as e:
            self._send_json(502, {"error": f"Couldn't reach the Gemini API: {e}"})
            return

        try:
            raw_text = gemini_response["candidates"][0]["content"]["parts"][0]["text"]
            analysis = json.loads(_strip_code_fence(raw_text))
        except (KeyError, IndexError, json.JSONDecodeError):
            self._send_json(502, {"error": "Gemini returned something that wasn't valid JSON. Try again."})
            return

        self._send_json(200, analysis)


def _strip_code_fence(text):
    """Gemini sometimes wraps JSON in ```json fences even when asked not to."""
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        if cleaned.lower().startswith("json"):
            cleaned = cleaned[4:]
    return cleaned.strip()
