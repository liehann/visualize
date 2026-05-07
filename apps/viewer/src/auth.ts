import NextAuth, { type Session } from 'next-auth';
import Authentik from 'next-auth/providers/authentik';
import { env } from './env';

export const isDevBypass = env.DEV_AUTH_BYPASS === 'true';

const DEV_SESSION: Session = {
  user: {
    email: 'dev@visualize.local',
    name: 'Dev User',
    image: null,
  },
  expires: '2099-01-01T00:00:00.000Z',
};

const nextAuth = NextAuth({
  secret: env.AUTH_SECRET,
  trustHost: true,
  providers: [
    Authentik({
      clientId: env.AUTHENTIK_CLIENT_ID,
      clientSecret: env.AUTHENTIK_CLIENT_SECRET,
      issuer: env.AUTHENTIK_ISSUER,
    }),
  ],
  session: { strategy: 'jwt' },
  callbacks: {
    async jwt({ token, profile }) {
      if (profile) {
        if (typeof profile.email === 'string') token.email = profile.email;
        if (typeof profile.name === 'string') token.name = profile.name;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.email) session.user.email = token.email;
      if (token.name) session.user.name = token.name;
      return session;
    },
  },
  pages: { signIn: '/sign-in' },
});

export const { handlers, signIn, signOut } = nextAuth;

export async function auth(): Promise<Session | null> {
  if (isDevBypass) return DEV_SESSION;
  return nextAuth.auth();
}
