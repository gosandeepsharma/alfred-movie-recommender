# Alfred Prototype

A React-based prototype for building a personalized digital persona through interactive preferences and Q&A sessions.

## Features

- **Home Chat**: Chat interface with context-aware responses
- **My Persona**: Track progress across different personality categories
- **Preferences**: Tinder-like card interface for rating movies and books
- **Q&A**: Answer questions across multiple categories to build your persona
- **Recommendations**: Get personalized movie and book recommendations based on your preferences

## Technologies

- React 18 + TypeScript
- Vite
- Tailwind CSS
- shadcn/ui components
- TMDB API (optional) for movie data
- Open Library API for book data

## Getting Started

### Prerequisites

- Node.js 16+ and npm

### Installation

1. Clone the repository
2. Navigate to the Prototype directory:
   ```bash
   cd Prototype
   ```

3. Install dependencies:
   ```bash
   npm install
   ```

4. (Optional) Set up TMDB API key:
   - Copy `.env.example` to `.env`
   - Get your API key from [TMDB](https://www.themoviedb.org/settings/api)
   - Add it to `.env`:
     ```
     VITE_TMDB_KEY=your_api_key_here
     ```

### Running the App

Start the development server:
```bash
npm run dev
```

The app will be available at `http://localhost:5173`

### Building for Production

```bash
npm run build
```

The production build will be in the `dist` directory.

## How It Works

The prototype demonstrates a cold-start to personalization flow:

1. Initially, recommendations are generic and unseeded
2. As users interact with Preferences (rating movies/books) and answer Q&A questions, the system builds a persona vector
3. Recommendations become increasingly personalized based on the user's preferences and answers
4. The persona is tracked across multiple categories showing completion progress

## Project Structure

```
Prototype/
├── src/
│   ├── components/
│   │   └── ui/          # Reusable UI components
│   ├── lib/
│   │   └── utils.ts     # Utility functions
│   ├── App.tsx          # Main application component
│   ├── main.tsx         # Application entry point
│   └── index.css        # Global styles
├── public/              # Static assets
└── ...config files
```

## Note

This is a prototype developed on ChatGPT to demonstrate the concept of building a personalized digital assistant through progressive user interaction.
