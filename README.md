# Redline

A small tool that reads your résumé (PDF) and marks it up the way a recruiter
would — overall score, missing sections, weak bullet points with rewrites,
and a keyword match against a job description if you paste one in.

I built this because I was tired of guessing why a résumé wasn't landing
interviews. This gives a quick, specific second opinion before you send it
somewhere that actually matters.

## How it works

- The frontend (`index.html`, `style.css`, `script.js`) is plain HTML/CSS/JS —
  no build step, no framework.
- You upload a PDF. It's converted to base64 in the browser and sent to
  `/api/analyze`.
- `api/analyze.py` is a Python serverless function (runs on Vercel) that
  forwards the file straight to the Gemini API, asks for a structured JSON
  review, and passes that back to the page.
- Nothing is written to a database or disk — the file only exists in memory
  for the duration of the request.

## Project structure

```
redline/
├── index.html          # page structure
├── style.css            # all styling
├── script.js             # upload handling + rendering results
├── api/
│   └── analyze.py        # Vercel Python function, calls Gemini
├── requirements.txt      # empty on purpose — stdlib only
├── vercel.json            # gives the function 30s instead of the 10s default
├── .env.example
└── .gitignore
```

## Running it yourself

You'll need a free Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey).

1. Clone the repo and `cd` into it.
2. `npm install -g vercel` (one-time, if you don't have it).
3. `vercel dev` — this runs both the static frontend and the Python function
   locally. It'll prompt you to link a project the first time.
4. Add `GEMINI_API_KEY` to a `.env` file locally (see `.env.example`), and to
   your Vercel project's environment variables for the deployed version.

## Known limits

- PDF only — scanned/image-only resumes will work since Gemini can read them
  visually, but a text-based PDF gives more reliable results.
- Vercel's free plan caps a single request body at 4.5MB. A normal 1-2 page
  text resume is nowhere close to that; a heavily-illustrated multi-page PDF
  could be.
- The score is Gemini's read of the resume, not a real ATS engine — it's a
  useful second opinion, not a guarantee any specific applicant tracking
  system would score it the same way.
