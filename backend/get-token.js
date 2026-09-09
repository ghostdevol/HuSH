import { getToken } from '@vercel/connect';

getToken('api.render.com/amber-castle', {
  subject: { type: "user", id: "usr_123" },
});
