# Project Flamingo 🦩

**Project Flamingo** is a premium, AI-powered book club platform designed to automate and elevate the literary debate experience.

## Features
- **Serverless AI Audio Pipeline:** Upload session recordings (up to 9.5 hours) directly to Firebase Cloud Functions. The backend utilizes Google Gemini for native audio analysis, transcript generation, and extraction of human-verified grades—without needing a third-party STT service.
- **Interactive Reading Dashboard:** Visualizes member participation, rating evolution (initial vs. final grades), and top-rated books across club sessions.
- **Premium Light-Mode UI:** A high-end editorial design language featuring frosted glass details, subtle animations, and the club's signature neon flamingo pink accents.
- **Session Memory Generation:** Automatically summarizes the debate, extracts verbatim quotes, and drafts the definitive session memory for the club's archive.

## Tech Stack
- **Frontend:** React, Vite, Custom CSS (Glassmorphism design tokens).
- **Backend & Database:** Firebase (Firestore, Cloud Storage, Functions).
- **AI Integration:** Google Gemini API (Audio native model).

## Setup
1. `npm install` to install frontend dependencies.
2. `npm run dev` to start the local Vite server.
3. Use Firebase CLI (`firebase deploy`) to manage the Cloud Functions and Firestore rules. Note: The Gemini API key is securely stored in Google Secret Manager.
