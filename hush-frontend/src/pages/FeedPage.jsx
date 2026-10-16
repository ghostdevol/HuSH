import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import PostCard from '../components/PostCard';

export default function FeedPage({ me, go }) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [composer, setComposer] = useState('');
  const [posting, setPosting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api('/feed');
      setPosts(data.posts);
    } catch (err) {
      setError('Could not reach the HuSH server. It may be waking up — try refresh in a few seconds.');
    }
    setLoading(false);
  }, [me]);

  useEffect(() => { load(); }, [load]);

  const submitPost = async (e) => {
    e.preventDefault();
    if (!composer.trim()) return;
    setPosting(true);
    try {
      const data = await api('/posts', { method: 'POST', body: { text: composer } });
      setPosts((prev) => [data.post, ...prev]);
      setComposer('');
    } catch (err) {
      setError(err.message);
    }
    setPosting(false);
  };

  return (
    <div className="mx-auto w-full max-w-xl space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-black tracking-wide">Feed</h2>
        <button onClick={load} className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-slate-300 shadow-md shadow-black/30 hover:bg-white/10">
          ↻ Refresh
        </button>
      </div>

      {me ? (
        <form onSubmit={submitPost} className="grad-card rounded-[22px] p-4">
          <textarea
            value={composer}
            onChange={(e) => setComposer(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder={`What's the word, ${me.displayName}?`}
            className="w-full resize-none rounded-xl border border-white/10 bg-black/30 p-3 text-sm text-slate-100 outline-none"
          />
          <div className="mt-2 flex items-center justify-between">
            <span className="text-[10px] text-slate-500">{composer.length}/500</span>
            <button type="submit" disabled={posting || !composer.trim()} className="rounded-xl bg-gradient-to-r from-rose-500 to-pink-600 px-5 py-2 text-xs font-bold uppercase text-white shadow-lg shadow-rose-950/50 disabled:opacity-50">
              Post
            </button>
          </div>
        </form>
      ) : (
        <button onClick={() => go('profile')} className="w-full rounded-2xl border border-rose-400/30 bg-rose-500/10 p-4 text-sm font-bold text-rose-200 shadow-lg shadow-black/30">
          Log in or create an account to post, like and comment →
        </button>
      )}

      {error && <p className="text-xs text-rose-400">{error}</p>}
      {loading && <p className="py-8 text-center text-sm text-slate-500">Loading feed…</p>}
      {!loading && posts.length === 0 && !error && (
        <p className="py-8 text-center text-sm text-slate-500">No posts yet. Be the first.</p>
      )}
      {posts.map((post) => (
        <PostCard key={post.id} post={post} me={me} onNeedLogin={() => go('profile')} />
      ))}
    </div>
  );
}
