import NextAuth from 'next-auth';
import Authentik from 'next-auth/providers/authentik';
import { env } from './env.js';

export const { auth, handlers, signIn, signOut } = NextAuth({
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
        // Persist Authentik subject + email + name on the JWT so the UI can
        // show "approved by ..." attribution without a DB round-trip.
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
  pages: {
    signIn: '/sign-in',
  },
});
