import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Heart, ThumbsDown, ThumbsUp, HelpCircle, Send, Sparkles, Film, BookOpen, MessageSquare, ChevronRight, ChevronLeft, Info } from "lucide-react";

// ---------------------------------------------------------
// ENV SAFE ACCESSOR: works in Vite, Next.js, or plain browser
// Avoids `process is not defined` in the browser.
// ---------------------------------------------------------
function readPublicEnv(name: string): string {
  // Vite-style (import.meta.env)
  try {
    const viteAny = (import.meta as any)?.env || {};
    if (typeof viteAny[name] === "string") return viteAny[name];
    // common prefix variant
    const vitePrefixed = viteAny["VITE_" + name];
    if (typeof vitePrefixed === "string") return vitePrefixed;
  } catch {}
  // Next.js-style (process.env) guarded
  try {
    const p: any = (globalThis as any)?.process;
    const val = p?.env?.[name];
    if (typeof val === "string") return val;
  } catch {}
  return "";
}

const TMDB_KEY: string = readPublicEnv("NEXT_PUBLIC_TMDB_KEY") || readPublicEnv("TMDB_KEY") || readPublicEnv("VITE_TMDB_KEY") || "";

// ---------------------------------------------------------
// External API hooks (TMDB + OpenLibrary fallback for books)
// ---------------------------------------------------------
async function fetchTMDBTrending() {
  if (!TMDB_KEY) return [] as any[];
  const res = await fetch(`https://api.themoviedb.org/3/trending/movie/week?api_key=${TMDB_KEY}`);
  const json = await res.json();
  return (json.results || []).map((m:any)=>({
    id: `tmdb_${m.id}`,
    title: m.title,
    img: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : "",
    tags: guessMovieTags(m)
  }));
}

function guessMovieTags(m:any): string[] {
  const g = (m.genre_ids || []) as number[];
  const map: Record<number,string> = {28:"action",12:"adventure",16:"animation",35:"comedy",80:"crime",99:"documentary",18:"drama",10751:"family",14:"fantasy",36:"history",27:"horror",10402:"music",9648:"mystery",10749:"romance",878:"sci-fi",10770:"tv",53:"thriller",10752:"war",37:"western"};
  return g.map(id=>map[id]).filter(Boolean);
}

// Goodreads is gated; use Open Library as a zero-auth fallback for prototype
async function fetchOpenLibraryPopular() {
  const res = await fetch('https://openlibrary.org/subjects/popular.json?limit=40');
  const json = await res.json();
  const works = json.works || [];
  return works.map((w:any)=>({
    id: `ol_${w.key}`,
    title: w.title,
    img: w.cover_id ? `https://covers.openlibrary.org/b/id/${w.cover_id}-L.jpg` : "",
    tags: (w.subject ? w.subject.slice(0,4) : []).map((s:string)=>s.toLowerCase())
  }));
}

// simplistic recommender
function computeScores(votes: Record<string, number>, persona: Record<string, number>, items: {id:string;tags:string[]}[]) {
  return items.map(it => {
    const vote = votes[it.id] ?? 0;
    const align = it.tags.reduce((s, t) => s + (persona[t] ?? 0), 0);
    return { id: it.id, score: vote * 2 + align };
  }).sort((a,b)=>b.score-a.score);
}

export default function App() {
  const [route, setRoute] = useState<'home'|'persona'|'prefs'|'qa'|'recs'>('home');
  const [chat, setChat] = useState<string>('');
  const [messages, setMessages] = useState<{role:'user'|'alfred';text:string}[]>([]);

  // preference votes: -1, 0, 1, 2
  const [movieVotes, setMovieVotes] = useState<Record<string, number>>({});
  const [bookVotes, setBookVotes] = useState<Record<string, number>>({});

  // fetched catalogs
  const [movies, setMovies] = useState<{id:string; title:string; img:string; tags:string[]}[]>([]);
  const [books, setBooks] = useState<{id:string; title:string; img:string; tags:string[]}[]>([]);

  // seeds if network/key missing
  const SEED_MOVIES = [
    { id: "seed_m1", title: "Arrival", img: "https://image.tmdb.org/t/p/w500/x2FJsf1ElAgr63Y3PNPtJrcmpoe.jpg", tags: ["sci-fi","philosophy"] },
    { id: "seed_m2", title: "Ford v Ferrari", img: "https://image.tmdb.org/t/p/w500/6ApDtO7xaWAfPqfi2IARXIzj8QS.jpg", tags: ["craft","sports"] },
  ];
  const SEED_BOOKS = [
    { id: "seed_b1", title: "Antifragile", img: "https://images-na.ssl-images-amazon.com/images/I/81c7xgXQk%252BL.jpg", tags: ["systems","risk"] },
    { id: "seed_b2", title: "Sapiens", img: "https://images-na.ssl-images-amazon.com/images/I/713jIoMO3UL.jpg", tags: ["history","humanity"] },
  ];

  React.useEffect(()=>{(async()=>{
    try { const m = await fetchTMDBTrending(); setMovies(m.length? m: SEED_MOVIES); } catch { setMovies(SEED_MOVIES); }
    try { const b = await fetchOpenLibraryPopular(); setBooks(b.length? b: SEED_BOOKS); } catch { setBooks(SEED_BOOKS); }
  })();},[]);

  // persona vector seeded and updated by Q&A and votes
  const [personaVec, setPersonaVec] = useState<Record<string, number>>({
    'sci-fi': 0, philosophy: 0, craft: 0, sports: 0, spy: 0, procedural: 0,
    documentary: 0, endurance: 0, survival: 0, systems: 0, risk: 0, history: 0,
    humanity: 0, ai: 0, cognition: 0, aerospace: 0, politics: 0, ethics: 0,
    science: 0, health: 0, innovation: 0, music: 0
  });

  // progress tracking by category
  const [answers, setAnswers] = useState<Record<string, {id:string; val:string}[]>>({});

  // ---------------- Home Chat (context-aware stub) ----------------
  const sendChat = () => {
    if (!chat.trim()) return;
    const userMsg = { role: 'user' as const, text: chat.trim() };
    const contextHint = topPersonaHints(personaVec).join(', ');
    const reply = { role: 'alfred' as const, text: `Context-aware: I kept in mind your interests (${contextHint}).` };
    setMessages(m => [...m, userMsg, reply]);
    setChat('');
  };

  // ---------------- Persona Completion ----------------
  const ALL_CATS = [
    "Overall Progress",
    "Cognition & Learning",
    "Core Identity",
    "Interests & Aesthetics",
    "Lifestyle & Habits",
    "Personality & Emotion",
    "Philosophy & Meaning",
    "Preferences",
    "Relationships & Social World",
    "Social World",
    "Work & Ambition",
    "Meta-Context",
  ];

  const QUESTION_BANK: Record<string, { id: string; text: string; kind: "yn" | "open" }[]> = {
    "Overall Progress": [ { id: "op1", text: "Ready to continue building your persona today?", kind: "yn" } ],
    "Cognition & Learning": [ { id: "cl1", text: "Do you prefer theory over practice?", kind: "yn" }, { id: "cl2", text: "What motivates you to learn?", kind: "open" } ],
    "Core Identity": [ { id: "ci1", text: "Would you describe yourself as a lifelong learner?", kind: "yn" }, { id: "ci2", text: "Three words that describe you best?", kind: "open" } ],
    "Interests & Aesthetics": [ { id: "ia1", text: "Do you enjoy minimalist design?", kind: "yn" }, { id: "ia2", text: "Name an artwork or film whose visuals you loved.", kind: "open" } ],
    "Lifestyle & Habits": [ { id: "lh1", text: "Are you a morning person?", kind: "yn" }, { id: "lh2", text: "Describe your ideal weekend.", kind: "open" } ],
    "Personality & Emotion": [ { id: "pe1", text: "Are you optimistic?", kind: "yn" }, { id: "pe2", text: "How do you respond to stress?", kind: "open" } ],
    "Philosophy & Meaning": [ { id: "pm1", text: "Do you believe purpose is chosen rather than found?", kind: "yn" }, { id: "pm2", text: "What gives your life meaning right now?", kind: "open" } ],
    "Preferences": [ { id: "pr1", text: "Do you prefer films to books this month?", kind: "yn" }, { id: "pr2", text: "List three comfort rewatch films or re-read books.", kind: "open" } ],
    "Relationships & Social World": [ { id: "rs1", text: "Do you prefer deep 1:1s over groups?", kind: "yn" }, { id: "rs2", text: "How do you make new friends?", kind: "open" } ],
    "Social World": [ { id: "sw1", text: "Do you enjoy organizing social events?", kind: "yn" }, { id: "sw2", text: "Describe your ideal social evening.", kind: "open" } ],
    "Work & Ambition": [ { id: "wa1", text: "Do you value mastery over recognition?", kind: "yn" }, { id: "wa2", text: "Your ideal project?", kind: "open" } ],
    "Meta-Context": [ { id: "mc1", text: "Would you like Alfred to learn passively from your activity?", kind: "yn" }, { id: "mc2", text: "What data should Alfred never use?", kind: "open" } ],
  };

  const categoryCompletion = (cat: string) => {
    const total = QUESTION_BANK[cat]?.length ?? 1; // avoid NaN for display-only cats
    const done = (answers[cat]?.length ?? 0);
    return Math.min(100, Math.round((done/total)*100));
  };

  const overall = Math.round(
    ALL_CATS.filter(c=>c!=="Overall Progress").reduce((s,c)=>s+categoryCompletion(c),0) / (ALL_CATS.length-1)
  );

  // ---------------- Preferences Flow ----------------
  const [prefMode, setPrefMode] = useState<'movies'|'books'>('movies');
  const [prefIndex, setPrefIndex] = useState(0);
  const deck = prefMode==='movies'? movies: books;
  const votes = prefMode==='movies'? movieVotes: bookVotes;

  const vote = (v: number) => { // -1,1,2 or 0 for unknown
    const item = deck[prefIndex];
    if (!item) return;
    const setter = prefMode==='movies'? setMovieVotes: setBookVotes;
    setter(prev => ({...prev, [item.id]: v}));
    // update persona vector from tags
    if (v!==0) bumpPersona(item.tags, v);
    setPrefIndex(i => (i+1) % deck.length);
  };

  function bumpPersona(tags: string[], delta: number){
    setPersonaVec(p => {
      const n = {...p};
      tags.forEach(t=>{ n[t] = (n[t] ?? 0) + delta; });
      return n;
    });
  }

  // ---------------- Q&A ----------------
  const [qaCat, setQaCat] = useState(ALL_CATS[1]); // skip "Overall Progress" by default
  const [qaIdx, setQaIdx] = useState(0);
  const q = (QUESTION_BANK[qaCat] ?? [])[qaIdx];
  const [yn, setYn] = useState<'yes'|'no'|''>('');
  const [open, setOpen] = useState('');

  const saveQA = () => {
    if (!q) return;
    const val = q.kind==='yn' ? yn : open.trim();
    if (!val) return;
    setAnswers(a=>{
      const arr = a[qaCat]? [...a[qaCat]]: [];
      arr.push({id:q.id, val});
      return {...a, [qaCat]: arr};
    });
    setYn(''); setOpen(''); setQaIdx(i => (i+1)%(QUESTION_BANK[qaCat]?.length || 1));
  };

  // ---------------- Recommendations ----------------
  const [recMode, setRecMode] = useState<'movies'|'books'>('movies');
  const [recPage, setRecPage] = useState(0);
  const PAGE_SIZE = 10;
  const movieScores = computeScores(movieVotes, personaVec, movies);
  const bookScores = computeScores(bookVotes, personaVec, books);
  const recList = recMode==='movies'? movieScores: bookScores;
  const totalPages = Math.max(1, Math.ceil(recList.length / PAGE_SIZE));
  const paged = recList.slice(recPage*PAGE_SIZE, recPage*PAGE_SIZE + PAGE_SIZE);

  // ---------------- Nav ----------------
  function Nav(){
    return (
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t flex justify-around py-2">
        <Button variant={route==='home'? 'default':'ghost'} onClick={()=>setRoute('home')}><MessageSquare className="mr-2 h-4 w-4"/>Home</Button>
        <Button variant={route==='persona'? 'default':'ghost'} onClick={()=>setRoute('persona')}><Sparkles className="mr-2 h-4 w-4"/>My Persona</Button>
        <Button variant={route==='prefs'? 'default':'ghost'} onClick={()=>setRoute('prefs')}><Film className="mr-2 h-4 w-4"/>Preferences</Button>
        <Button variant={route==='qa'? 'default':'ghost'} onClick={()=>setRoute('qa')}>Q&A</Button>
        <Button variant={route==='recs'? 'default':'ghost'} onClick={()=>setRoute('recs')}>Recs</Button>
      </div>
    );
  }

  // ---------------- Dev Diagnostics (lightweight tests) ----------------
  const missingTmdb = !TMDB_KEY;

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <div className="max-w-md mx-auto p-4 space-y-4">
        {missingTmdb && (
          <Card>
            <CardHeader className="py-2">
              <div className="flex items-center text-amber-700 text-xs gap-2"><Info className="h-3 w-3"/>TMDB key not set. Using seed movies. Set NEXT_PUBLIC_TMDB_KEY / VITE_TMDB_KEY for live posters.</div>
            </CardHeader>
          </Card>
        )}

        {/* ---------------- Home ---------------- */}
        {route==='home' && (
          <Card>
            <CardHeader><CardTitle>Talk to Alfred</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2 max-h-[420px] overflow-auto">
                {messages.map((m,i)=> (
                  <div key={i} className={`p-3 rounded-2xl ${m.role==='user'? 'bg-blue-100 text-blue-900 ml-10':'bg-violet-100 text-violet-900 mr-10'}`}>{m.text}</div>
                ))}
              </div>
              <div className="flex gap-2">
                <Input value={chat} onChange={e=>setChat(e.target.value)} placeholder="Say anything…"/>
                <Button onClick={sendChat}><Send className="h-4 w-4"/></Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ---------------- Persona ---------------- */}
        {route==='persona' && (
          <Card>
            <CardHeader>
              <CardTitle>My Persona</CardTitle>
              <div className="text-xs text-slate-500 mt-1">Progress</div>
            </CardHeader>
            <CardContent className="space-y-3">
              {ALL_CATS.map(cat => (
                <div key={cat} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span>{cat}</span>
                    <span>{cat==="Overall Progress"? overall: categoryCompletion(cat)}%</span>
                  </div>
                  <Progress value={cat==="Overall Progress"? overall: categoryCompletion(cat)} className="h-2"/>
                </div>
              ))}
              <div className="grid grid-cols-2 gap-2 pt-2">
                <Button variant="outline" onClick={()=>setRoute('prefs')}>Preferences</Button>
                <Button onClick={()=>setRoute('qa')}>Q&A</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ---------------- Preferences ---------------- */}
        {route==='prefs' && (
          <Card>
            <CardHeader><CardTitle>Preferences</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Tabs value={prefMode} onValueChange={(v)=>setPrefMode(v as any)}>
                <TabsList className="grid grid-cols-2">
                  <TabsTrigger value="movies">Movies</TabsTrigger>
                  <TabsTrigger value="books">Books</TabsTrigger>
                </TabsList>
                <TabsContent value="movies" />
                <TabsContent value="books" />
              </Tabs>
              {/* Portrait poster: use aspect 2/3 and object-contain to avoid crop */}
              <div className="rounded-xl overflow-hidden border bg-gray-100">
                {deck[prefIndex] && (
                  <div className="w-full aspect-[2/3]">
                    <img
                      alt={deck[prefIndex].title}
                      src={deck[prefIndex].img}
                      className="w-full h-full object-contain"
                      onError={(e)=>{(e.currentTarget as HTMLImageElement).src = 'data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 200 300\'><rect width=\'100%\' height=\'100%\' fill=\'%23e5e7eb\'/><text x=\'50%\' y=\'50%\' dominant-baseline=\'middle\' text-anchor=\'middle\' font-size=\'14\' fill=\'%236b7280\'>No Image</text></svg>'; }}
                    />
                  </div>
                )}
              </div>
              <div className="text-center text-sm text-slate-600">{deck[prefIndex]?.title}</div>
              <div className="grid grid-cols-4 gap-2">
                <Button variant="outline" onClick={()=>vote(-1)} title="Downvote"><ThumbsDown className="h-5 w-5"/></Button>
                <Button variant="outline" onClick={()=>vote(1)} title="Upvote"><ThumbsUp className="h-5 w-5"/></Button>
                <Button onClick={()=>vote(2)} title="Love"><Heart className="h-5 w-5"/></Button>
                <Button variant="outline" onClick={()=>vote(0)} title="Don't know"><HelpCircle className="h-5 w-5"/></Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ---------------- Q&A ---------------- */}
        {route==='qa' && (
          <Card>
            <CardHeader><CardTitle>Q&A</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Select value={qaCat} onValueChange={(v)=>{ setQaCat(v); setQaIdx(0); }}>
                <SelectTrigger><SelectValue placeholder="Choose category"/></SelectTrigger>
                <SelectContent>
                  {ALL_CATS.map(c=> <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="p-4 rounded-xl bg-white border">
                {q ? (
                  <>
                    <div className="text-base font-medium mb-2">{q.text}</div>
                    {q.kind==='yn' ? (
                      <div className="grid grid-cols-2 gap-2">
                        <Button variant={yn==='no'? 'default':'outline'} onClick={()=>setYn('no')}>No</Button>
                        <Button variant={yn==='yes'? 'default':'outline'} onClick={()=>setYn('yes')}>Yes</Button>
                      </div>
                    ) : (
                      <Textarea value={open} onChange={e=>setOpen(e.target.value)} placeholder="Type a brief answer"/>
                    )}
                    <div className="pt-3 flex gap-2 justify-end">
                      <Button variant="outline" onClick={()=>setQaIdx(i => (i+1)%(QUESTION_BANK[qaCat]?.length || 1))}>Skip</Button>
                      <Button onClick={saveQA}>Save</Button>
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-slate-500">No questions available for this category yet.</div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ---------------- Recommendations ---------------- */}
        {route==='recs' && (
          <Card>
            <CardHeader><CardTitle>Recommendations</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <Tabs value={recMode} onValueChange={(v)=>{ setRecMode(v as any); setRecPage(0); }}>
                <TabsList className="grid grid-cols-2">
                  <TabsTrigger value="movies">Movies</TabsTrigger>
                  <TabsTrigger value="books">Books</TabsTrigger>
                </TabsList>
                <TabsContent value="movies" />
                <TabsContent value="books" />
              </Tabs>

              <div className="space-y-3">
                {paged.map(s=> {
                  const item = (recMode==='movies'? movies: books).find(x=>x.id===s.id)!;
                  return (
                    <div key={item.id} className="flex gap-3 items-center">
                      <div className="w-16 aspect-[2/3] bg-gray-100 rounded overflow-hidden">
                        <img src={item.img} alt={item.title} className="w-full h-full object-contain"/>
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-medium">{item.title}</div>
                        <div className="text-xs text-slate-600">Fit score: {s.score.toFixed(1)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-between pt-2">
                <Button variant="outline" disabled={recPage===0} onClick={()=>setRecPage(p=>Math.max(0,p-1))}><ChevronLeft className="h-4 w-4 mr-1"/>Prev</Button>
                <div className="text-xs text-slate-600">Page {recPage+1} / {totalPages}</div>
                <Button variant="outline" disabled={recPage>=totalPages-1} onClick={()=>setRecPage(p=>Math.min(totalPages-1,p+1))}>Next<ChevronRight className="h-4 w-4 ml-1"/></Button>
              </div>

              <div className="text-xs text-slate-500">Hint: interact with Preferences and Q&A. As signals grow, ordering changes — proving cold-start → personalization.</div>
            </CardContent>
          </Card>
        )}
      </div>
      <Nav/>
    </div>
  );
}

function topPersonaHints(p: Record<string, number>){
  return Object.entries(p).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([k])=>k);
}
