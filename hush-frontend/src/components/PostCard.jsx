import React, { useState } from 'react';
import { api } from '../api';
import { API_BASE } from '../config';
import AvatarView from './AvatarView';

export function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

// One feed/profile post: author header (accent color on the name),
// optional attached bucket photo, like toggle, expandable comments.
// onPin/pinned are optional — the own-profile page passes them so the
// owner can pin/unpin; the feed leaves them off.
export default function PostCard({ post, me, onNeedLogin, onPin, pinned, cardStyle }) {
  const [liked, setLiked] = useState(post.likedByMe);
  const [likeCount, setLikeCount] = useState(post.likeCount);
  const [commentCount, setCommentCount] = useState(post.commentCount);
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const toggleLike = async () => {
    if (!me) { onNeedLogin(); return; }
    try {
      const data = await api(`/posts/${post.id}/like`, { method: 'POST', body: {} });
      setLiked(data.liked);
      setLikeCount(data.likeCount);
    } catch (err) { console.error(err); }
  };

  const loadComments = async () => {
    if (comments === null) {
      try {
        const data = await api(`/posts/${post.id}/comments`);
        setComments(data.comments);
      } catch { setComments([]); }
    }
    setOpen(!open);
  };

  const submitComment = async (e) => {
    e.preventDefault();
    if (!me) { onNeedLogin(); return; }
    if (!draft.trim()) return;
    setBusy(true);
    try {
      const data = await api(`/posts/${post.id}/comments`, { method: 'POST', body: { text: draft } });
      setComments((prev) => [...(prev || []), data.comment]);
      setCommentCount(data.commentCount);
      setDraft('');
      setOpen(true);
    } catch (err) { console.error(err); }
    setBusy(false);
  };

  return (
    <article className="rounded-2xl border border-white/5 bg-white/5 p-4" style={cardStyle}>
      <header className="mb-2 flex items-center gap-2.5">
        <AvatarView user={post.author} size={36} />
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-white">{post.author.displayName}</p>
          <p className="text-[11px] text-slate-400">@{post.author.handle} • {timeAgo(post.createdAt)}</p>
        </div>
        {onPin && (
          <button
            onClick={() => onPin(post)}
            className={`ml-auto shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-bold ${
              pinned ? 'bg-purple-600 text-white' : 'border border-white/10 bg-white/5 text-slate-300'
            }`}
          >
            {pinned ? '📌 Pinned' : '📌 Pin'}
          </button>
        )}
      </header>

      {post.text && <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-100">{post.text}</p>}

      {post.photo && (
        <img
          src={API_BASE + post.photo.url}
          alt={post.photo.caption || 'Post photo'}
          className="mt-2 max-h-96 w-full rounded-xl border border-white/10 object-cover"
        />
      )}

      <div className="mt-3 flex items-center gap-4">
        <button onClick={toggleLike} className={`text-xs font-bold ${liked ? 'text-rose-400' : 'text-slate-400'}`}>
          {liked ? '❤️' : '🤍'} {likeCount}
        </button>
        <button onClick={loadComments} className="text-xs font-bold text-slate-400">
          💬 {commentCount} comments
        </button>
      </div>

      {open && (
        <div className="mt-3 space-y-2 border-t border-white/5 pt-3">
          {(comments || []).map((c) => (
            <div key={c.id} className="flex items-start gap-1.5 text-xs">
              <AvatarView user={c.author} size={18} />
              <span>
                <span className="font-bold text-slate-200">@{c.author.handle}</span>{' '}
                <span className="text-slate-300">{c.text}</span>
                <span className="ml-2 text-[10px] text-slate-500">{timeAgo(c.createdAt)}</span>
              </span>
            </div>
          ))}
          {comments !== null && comments.length === 0 && (
            <p className="text-xs text-slate-500">No comments yet.</p>
          )}
          <form onSubmit={submitComment} className="flex gap-2 pt-1">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={me ? 'Write a comment...' : 'Log in to comment'}
              disabled={!me}
              className="flex-1 rounded-lg border border-white/10 bg-slate-900 px-3 py-1.5 text-xs text-slate-100 outline-none disabled:opacity-50"
            />
            <button type="submit" disabled={busy || !me} className="rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">
              Post
            </button>
          </form>
        </div>
      )}
    </article>
  );
}
