export type Lang = 'ar' | 'fr' | 'en';
export type T3 = { ar: string; fr: string; en: string };
export type Phase = 'idle' | 'countdown' | 'question' | 'reveal' | 'finished';

export interface Seat { rank: number; nickname: string; avatar: string; points: number; ms: number; demo?: boolean }
export interface FeedItem { id: number; nickname: string; avatar: string; text: string; correct: boolean; rank?: number }
export interface Board { rank: number; id: string; nickname: string; avatar: string; points: number; correct: number; wins: number; demo: boolean }
export interface Effects { sound: boolean; volume: number; confetti: boolean; lowFx: boolean; sounds: Record<SoundEvent, string> }
export type SoundEvent = 'question' | 'tick' | 'correct' | 'wrong' | 'first' | 'win';

export interface PublicQuestion {
  id: string; category: string; subcategory: string; difficulty: string; type: string; answerMode: 'choice' | 'text';
  text: T3; image: string; choices: T3[]; hint: { words: string[][]; level: number } | null; attempts: number;
  seats: Seat[]; feed: FeedItem[]; startedAt: number;
}
export interface GameState {
  phase: Phase; paused: boolean; gameId: string | null; serverNow: number; phaseEndsAt: number | null; pausedRemaining: number | null;
  duration: number; reveal: number; index: number; total: number;
  config: { lang: Lang; hints: boolean; showFeed: boolean; showLeaderboard: boolean; winners: number; points: number[] };
  effects: Effects;
  question: PublicQuestion | null;
  result: { reason: string; winners: Seat[]; answer: T3; correctIndex: number | null; source: { title: string; url: string } } | null;
  final: { champion: Board | null; top: Board[]; questions: number; total: number; status: string } | null;
  leaderboard: Board[]; allTime: Board[];
}
export interface ProviderStatus {
  type: 'none' | 'tiktok' | 'demo' | 'manual' | 'webhook'; state: 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error' | 'ended';
  username: string; message: { ar: string; en: string; code?: string } | null; viewers: number; received: number; lastAt: number | null;
  attempt: number; retryAt: number | null; since: number | null;
}
export interface CommentEntry { id: string; at: number; platform: string; nickname: string; avatar: string; text: string; outcome: string; rank: number | null; points: number }
export interface HostView { questionId: string; correctIndex: number | null; accepted: string[]; notes: string }
export interface Category { id: string; icon: string; name: T3; subcategories: { id: string; name: T3 }[] }
export interface Meta { name: string; categories: Category[]; langs: Lang[]; difficulties: string[]; regions: string[]; statuses: string[]; types: string[]; imageTypes: string[] }

export interface Settings {
  round: { categories: string[]; excludeSubcategories: string[]; difficulties: string[]; types: string[]; count: number; progressive: boolean };
  timing: { duration: number; reveal: number; startDelay: number; autoAdvance: boolean };
  scoring: { winners: number; points: number[] };
  quota: { arab: number; world: number; foreign: number };
  display: { lang: Lang; hints: boolean; showFeed: boolean; showLeaderboard: boolean; shuffleChoices: boolean };
  effects: Effects;
  provider: { type: ProviderStatus['type']; username: string; autoReconnect: boolean; ingestKey: string };
}

export interface Question {
  id: string; category: string; subcategory: string; region: string; difficulty: string; type: string; text: T3; image: string;
  choices: T3[]; correct: number | null; answers: { ar: string[]; fr: string[]; en: string[] }; source: { title: string; url: string };
  factKey: string; volatile: boolean; verifiedAt: string; tags: string[]; notes: string; status: string; createdAt: string; updatedAt: string;
  validation?: { errors: string[]; structural: string[]; quality: string[]; warnings: string[]; publishable: boolean };
}
export interface Player {
  id: string; platform: string; unique_id: string; nickname: string; avatar: string; points: number; correct: number; wins: number; podiums: number;
  attempts: number; banned: number; is_demo: number; first_seen: number; last_seen: number; rank: number | null;
}
export interface GameRow { id: string; started_at: number; ended_at: number | null; status: string; questions_played: number; players_count: number; champion_name: string | null; champion_avatar: string | null; champion_points: number | null; top: Board[]; provider: string }
