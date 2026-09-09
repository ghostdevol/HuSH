{"type" "module"
}
import { startAuthorization } from '@vercel/connect';

startAuthorization('api.render.com/amber-castle', {
  subject: { type: "user", id: "usr_123" }
});