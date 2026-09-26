# BuildCarrers — Proposed System Architecture

> **Status:** The sections below describe the proposed target architecture. The current implementation is a local-first Vite/JavaScript frontend, a Node.js/Express API, and Qwen3/Nomic GGUF models served by Ollama. It has no account service, PostgreSQL database, or pgvector store yet. See the [README](README.md) for the implemented system and local setup.

## 1. Project Overview

An AI-powered professional profile and career intelligence platform where users can:

- Create a public professional bio/profile.
- Add skills, education, projects, experience, certifications, and achievements.
- Upload an existing resume in PDF/DOCX/TXT format.
- Provide a target job description through text, document, or URL.
- Compare their demonstrated skills with job requirements.
- Identify skills that are missing or not demonstrated in their uploaded information.
- Generate a truthful, job-specific ATS-friendly resume.
- Run the main AI pipeline locally instead of depending on OpenAI/Gemini APIs.

The RAG system must retrieve information **only from the current user's uploaded resume/profile/job data**.

---

## 2. Recommended Local AI Models

### Embedding Model

**Nomic Embed Text v1.5**

- Purpose: semantic embeddings and RAG retrieval.
- Model: `nomic-ai/nomic-embed-text-v1.5`
- Qualcomm AI Hub model: Nomic-Embed-Text.
- Used to embed resume chunks, profile information, job requirements, projects, and experience.

### Local LLM

**Qwen3-4B-Instruct-2507**

- Purpose: requirement extraction, skill-gap reasoning, resume generation, and explanations.
- Model: `Qwen/Qwen3-4B-Instruct-2507`
- Qualcomm AI Hub provides optimized configurations for supported Snapdragon hardware.
- During Intel development, run the original/quantized model using a compatible local runtime.

> Do not train either model from scratch. Use pretrained models and build the application-specific RAG and matching pipeline around them.

---

## 3. Complete System Architecture

```text
┌──────────────────────────────────────────────────────────────┐
│                         USER                                 │
│                                                              │
│ Profile │ Skills │ Resume │ Job URL/JD │ Generate Resume    │
└──────────────────────────────┬───────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────┐
│                     NEXT.JS FRONTEND                         │
│                                                              │
│ Dashboard          Public Profile                            │
│ Resume Upload      Job Analyzer                              │
│ Skill Gap          Resume Builder                            │
└──────────────────────────────┬───────────────────────────────┘
                               │ REST API
                               ▼
┌──────────────────────────────────────────────────────────────┐
│                     FASTAPI BACKEND                          │
│                                                              │
│ Authentication      Profile Service                          │
│ Resume Service      Job Analysis Service                     │
│ RAG Service         Resume Generator                         │
└──────────────┬─────────────────────────┬─────────────────────┘
               │                         │
       ┌───────▼────────┐        ┌──────▼──────────────────┐
       │   PostgreSQL   │        │    Document Processor   │
       │                │        │                         │
       │ Users          │        │ PDF  → PyMuPDF          │
       │ Profiles       │        │ DOCX → python-docx      │
       │ Skills         │        │ TXT  → parser           │
       │ Experience     │        │ URL  → extracted text   │
       │ Projects       │        └────────────┬────────────┘
       │ Jobs           │                     │
       │ Resume Versions│                     ▼
       └───────┬────────┘             Semantic Chunking
               │                             │
               │                             ▼
               │                 ┌─────────────────────────┐
               │                 │ NOMIC-EMBED-TEXT v1.5  │
               │                 │ Local Embedding Model   │
               │                 └────────────┬────────────┘
               │                              │
               ▼                              ▼
       ┌────────────────────────────────────────────┐
       │          PostgreSQL + pgvector             │
       │                                            │
       │ resume_chunks                              │
       │ profile_chunks                             │
       │ job_chunks                                 │
       │ embeddings                                 │
       └─────────────────────┬──────────────────────┘
                             │
                      Similarity Search
                             │
                             ▼
                  TOP-K RELEVANT EVIDENCE
                             │
                             ▼
              ┌──────────────────────────────┐
              │ QWEN3-4B-INSTRUCT-2507      │
              │ Local LLM                    │
              └──────────────┬───────────────┘
                             │
              ┌──────────────┼───────────────┐
              │              │               │
              ▼              ▼               ▼
         Skill Gap       Job Match       Tailored
         Analysis        Analysis        Resume
              │              │               │
              └──────────────┼───────────────┘
                             ▼
                     JSON RESPONSE
                             │
                             ▼
                      NEXT.JS UI
```

---

## 4. Recommended Technology Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js + TypeScript |
| UI | Tailwind CSS + shadcn/ui |
| Backend | FastAPI + Python |
| Main Database | PostgreSQL |
| Vector Search | pgvector |
| Authentication | Supabase Auth / Clerk / custom JWT |
| File Storage | Local during development; S3/Supabase later |
| PDF Parsing | PyMuPDF |
| DOCX Parsing | python-docx |
| Embeddings | Nomic Embed Text v1.5 |
| Local LLM | Qwen3-4B-Instruct-2507 |
| Intel Runtime | Transformers / llama.cpp / Ollama depending model format |
| Qualcomm Deployment | Qualcomm AI Hub / QAIRT / GenieX where supported |
| Resume Export | HTML/CSS template → PDF |

---

## 5. Resume RAG Pipeline

```text
resume.pdf / resume.docx
          ↓
Document Parser
          ↓
Text Cleaning
          ↓
Section Detection
          ↓
┌───────────────────┐
│ Skills            │
│ Education         │
│ Experience        │
│ Projects          │
│ Certifications    │
│ Achievements      │
└─────────┬─────────┘
          ↓
Semantic Chunking
          ↓
Nomic Embed Text
          ↓
Vector Embeddings
          ↓
PostgreSQL + pgvector
```

Avoid blindly splitting the resume every fixed number of characters. Preserve semantic sections whenever possible.

Example chunk:

```json
{
  "type": "project",
  "title": "Airline Reservation System",
  "content": "Developed an airline reservation database...",
  "skills": ["SQL", "PostgreSQL", "PL/SQL", "DBMS"]
}
```

---

## 6. Job Description Pipeline

```text
Job URL / PDF / DOCX / Pasted Text
                ↓
           Text Extraction
                ↓
          Qwen3-4B-Instruct
                ↓
       Structured Requirements
                ↓
      Individual RAG Queries
```

Example structured result:

```json
{
  "role": "Backend Developer",
  "required_skills": [
    "Python",
    "FastAPI",
    "PostgreSQL",
    "Docker"
  ],
  "preferred_skills": [
    "AWS",
    "Redis"
  ],
  "experience": "2+ years",
  "education": "Bachelor's degree"
}
```

---

## 7. Skill Matching Pipeline

Do not rely only on an LLM prompt. Use a hybrid pipeline.

```text
Job Requirement
      ↓
Skill Normalization
      ↓
Exact Matching
      +
Semantic Similarity
      +
RAG Evidence Retrieval
      ↓
Qwen Verification
      ↓
Final Match Status
```

Recommended statuses:

- `matched`
- `partial_match`
- `not_demonstrated`

Use **not demonstrated** rather than automatically claiming the user does not possess a skill. The system only knows what the user supplied.

Example:

```json
{
  "requirement": "Docker",
  "status": "matched",
  "confidence": 0.91,
  "evidence": [
    "Containerized a FastAPI backend using Docker."
  ]
}
```

---

## 8. Critical RAG Privacy Rule

Every retrieval operation must be isolated to the current user.

Conceptually:

```sql
WHERE user_id = CURRENT_USER_ID
```

Never retrieve chunks belonging to another user's resume or profile.

A vector similarity query must therefore combine semantic similarity with user filtering.

---

## 9. Truthful Resume Generation

```text
Target Job
    ↓
Extract Requirements
    ↓
RAG Queries
    ↓
Retrieve Relevant Evidence
    ↓
Qwen3-4B-Instruct
    ↓
Structured Resume JSON
    ↓
Resume Template
    ↓
PDF / DOCX
```

The LLM system instruction should include:

```text
You may rewrite, summarize, and reorganize retrieved information.

You MUST NOT invent:
- skills
- companies
- employment
- projects
- education
- certifications
- achievements
- dates
- metrics

Every factual candidate claim must be supported by the supplied profile or retrieved evidence.
If evidence is absent, omit the claim.
```

---

## 10. Suggested Database Structure

Use PostgreSQL for structured information and pgvector for embeddings.

Core tables:

```text
users
profiles
skills
education
experience
projects
certifications
resumes
resume_versions
jobs
job_requirements
job_matches
resume_chunks
profile_chunks
job_chunks
```

A vector chunk should retain metadata such as:

```text
chunk_id
user_id
source_id
source_type
section_type
content
embedding
created_at
```

---

## 11. Local Development vs Qualcomm Deployment

### Intel i5 Development

```text
Intel Windows PC
       │
       ├── Nomic Embed Text
       │      ↓
       │  Local embeddings
       │
       └── Qwen3-4B-Instruct
              ↓
       Transformers / llama.cpp / Ollama
```

### Qualcomm Hackathon Deployment

```text
Supported Snapdragon Device
            │
            ├── Nomic Embed Text
            │       ↓
            │ Qualcomm AI Runtime / NPU
            │
            └── Qwen3-4B-Instruct
                    ↓
              Qualcomm optimized runtime
```

Do not install the Windows ARM GenieX build on an Intel i5 machine.

---

# 12. Model Download Script

Create:

```text
download_models.py
```

with:

```python
from huggingface_hub import snapshot_download
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
MODEL_DIR = BASE_DIR / "models"

QWEN_DIR = MODEL_DIR / "qwen3-4b-instruct-2507"
NOMIC_DIR = MODEL_DIR / "nomic-embed-text-v1.5"

MODEL_DIR.mkdir(parents=True, exist_ok=True)

print("=" * 60)
print("LOCAL AI MODEL DOWNLOADER")
print("=" * 60)

print("\n[1/2] Downloading Nomic Embed Text v1.5...")

snapshot_download(
    repo_id="nomic-ai/nomic-embed-text-v1.5",
    local_dir=str(NOMIC_DIR),
)

print("\nNomic model downloaded successfully:")
print(NOMIC_DIR)

print("\n[2/2] Downloading Qwen3-4B-Instruct-2507...")
print("The Qwen repository is large. Please wait...")

snapshot_download(
    repo_id="Qwen/Qwen3-4B-Instruct-2507",
    local_dir=str(QWEN_DIR),
)

print("\nQwen model downloaded successfully:")
print(QWEN_DIR)

print("\n" + "=" * 60)
print("ALL MODELS DOWNLOADED")
print("=" * 60)
print(f"\nNomic : {NOMIC_DIR}")
print(f"Qwen  : {QWEN_DIR}")
```

---

## 13. Windows Setup Commands

Open Command Prompt inside the project directory.

### Create virtual environment

```cmd
python -m venv venv
```

### Activate it

```cmd
venv\Scripts\activate
```

### Install downloader

```cmd
python -m pip install --upgrade pip
pip install -U huggingface_hub
```

### Download models

```cmd
python download_models.py
```

Expected structure:

```text
qualcomm Hackathon/
│
├── models/
│   ├── qwen3-4b-instruct-2507/
│   │   ├── config.json
│   │   ├── tokenizer files...
│   │   └── model safetensor files...
│   │
│   └── nomic-embed-text-v1.5/
│       ├── config.json
│       ├── tokenizer files...
│       └── model files...
│
├── backend/
├── frontend/
├── download_models.py
└── venv/
```

---

## 14. Intel i5 Optimization

The original Qwen repository is relatively large. On an Intel i5, particularly with limited RAM, a quantized Q4 model can be considerably easier to run.

Recommended development direction:

```text
Qwen3-4B-Instruct
        ↓
      Q4 GGUF
        ↓
llama.cpp / Ollama
```

If the PC has insufficient RAM for comfortable 4B inference, use a smaller compatible Qwen model during development while retaining Qwen3-4B-Instruct-2507 as the intended Qualcomm deployment model.

---

## 15. End-to-End Request Flow

```text
User creates profile
        ↓
Uploads resume
        ↓
Resume parser
        ↓
Semantic chunks
        ↓
Nomic embeddings
        ↓
pgvector
        ↓
User provides target job
        ↓
Qwen extracts requirements
        ↓
Each requirement becomes a retrieval query
        ↓
Nomic embeds query
        ↓
pgvector searches ONLY current user's evidence
        ↓
Top-K evidence returned
        ↓
Qwen verifies match
        ↓
┌─────────────────────────────┐
│ Matched Skills              │
│ Partial Matches             │
│ Skills Not Demonstrated     │
│ Supporting Evidence         │
│ Suggested Learning Areas    │
└──────────────┬──────────────┘
               ↓
      Generate tailored resume
               ↓
      Evidence-grounded Qwen output
               ↓
            PDF / DOCX
```

---

## 16. Core Project Principle

**RAG retrieves evidence; the LLM reasons over the evidence.**

The system should never treat the LLM's general knowledge as evidence that a candidate possesses a skill.

```text
No supporting candidate evidence
            ↓
Do not claim the candidate has that qualification
```

This makes the generated resumes and skill-gap analysis substantially more trustworthy and explainable.
