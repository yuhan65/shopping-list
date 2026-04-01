# MealMate

AI-powered meal planning and shopping list app built with React Native (Expo) and Supabase.

## Features

- **Recipe Import** -- Import recipes from TikTok, YouTube, Xiaohongshu links, or create them with AI chat
- **Weekly Meal Plans** -- AI generates a 7-day meal plan based on your recipes and nutrition goals
- **Smart Shopping Lists** -- Auto-generated from meal plans with ingredients consolidated and categorized by store aisle
- **In-Store Camera** -- Scan food product packaging to get AI-powered quantity recommendations based on your shopping list
- **Body Tracking** -- Log weight, set goals (lose/maintain/gain), track exercise
- **Nutrition Targets** -- TDEE and macro calculations (Mifflin-St Jeor) based on your profile
- **Pantry Management** -- Track what you have at home with expiry date reminders
- **Smart Substitutions** -- AI suggests ingredient alternatives that maintain nutritional profile

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React Native, Expo SDK 55, Expo Router, TypeScript |
| Backend | Supabase (Postgres, Auth, Storage, Edge Functions) |
| AI | OpenAI GPT-4o (swappable via service abstraction) |
| State | TanStack Query (server), Zustand (local) |

## Getting Started

### Prerequisites

- Node.js 18+
- Expo CLI (`npm install -g expo-cli`)
- A [Supabase](https://supabase.com) project
- An OpenAI API key (or compatible provider)

### Setup

1. **Install dependencies**

```bash
npm install
```

2. **Configure environment variables**

```bash
cp .env.example .env
```

Edit `.env` with your Supabase URL, anon key, and AI API key.

3. **Set up the database**

Run the migration in `supabase/migrations/001_initial_schema.sql` against your Supabase project:
- Go to Supabase Dashboard > SQL Editor > paste and run the migration

4. **Deploy Edge Functions** (optional, for server-side recipe import)

```bash
supabase functions deploy recipe-import
supabase functions deploy ai-chat
```

Set secrets on your Supabase project:
```bash
supabase secrets set AI_API_KEY=your-openai-key AI_API_BASE=https://api.openai.com/v1 AI_MODEL=gpt-4o
```

5. **Start the app**

```bash
npx expo start
```

Scan the QR code with Expo Go, or press `i` for iOS simulator / `a` for Android emulator.

## Project Structure

```
app/                    Expo Router file-based routes
  (auth)/               Auth screens (login, signup, onboarding)
  (tabs)/               Main tab navigator (Home, Recipes, Shopping, Profile)
  recipe/               Recipe detail and add screens
  meal-plan/            Meal plan view and AI generation
  camera/               In-store camera product scanner
  body-log/             Weight and exercise logging
  pantry/               Pantry inventory management
components/ui/          Shared UI components (Button, Card, Input, etc.)
constants/              Colors, spacing, typography scales
hooks/                  Custom React hooks
lib/                    Core libraries
  ai/                   AI service abstraction (OpenAI, swappable)
  recipe-parser/        Recipe URL parser
  supabase.ts           Supabase client
  tdee.ts               TDEE/macro calculation
stores/                 Zustand state stores
types/                  TypeScript type definitions
supabase/
  migrations/           Database schema SQL
  functions/            Edge Functions (Deno)
```

## Environment Variables

| Variable | Description |
|----------|------------|
| `EXPO_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anon/public key |
| `EXPO_PUBLIC_AI_API_BASE` | AI API base URL (default: OpenAI) |
| `EXPO_PUBLIC_AI_API_KEY` | Your AI provider API key |
| `EXPO_PUBLIC_AI_MODEL` | Model name (default: `gpt-4o`) |
