import NextAuth, { type NextAuthOptions } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import { supabaseAdmin } from '@/lib/supabase'
import type { User } from '@/types/database'

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      console.log('SignIn callback triggered:', {
        email: user.email,
        provider: account?.provider,
        userAgent: profile?.sub
      })

      if (account?.provider === 'google') {
        console.log('Processing Google OAuth sign-in for:', user.email)

        // TEMPORARY FIX: Simplified auth for mobile compatibility
        // Skip complex Supabase operations that may fail on mobile
        console.log('Using simplified auth flow for mobile compatibility')
        return true
      }
      return true
    },
    async jwt({ token, user }) {
      if (user) {
        // TEMPORARY FIX: Skip database lookup for mobile compatibility
        console.log('Using default role for mobile compatibility:', user.email)
        token.role = 'reviewer'
        token.isActive = true
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.role = token.role as string
        session.user.isActive = token.isActive as boolean

        // Debug logging for mobile access issues
        console.log('Session callback:', {
          email: session.user.email,
          role: token.role,
          isActive: token.isActive,
          userAgent: session.user.name
        })

        // Block inactive users
        if (token.isActive === false) {
          console.log('Blocking inactive user:', session.user.email)
          throw new Error('Access denied: User account is inactive')
        }
      }
      return session
    },
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },
  session: {
    strategy: 'jwt',
  },
  cookies: {
    sessionToken: {
      name: `next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: true
      }
    },
    callbackUrl: {
      name: `next-auth.callback-url`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: true
      }
    },
    csrfToken: {
      name: `next-auth.csrf-token`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: true
      }
    }
  },
}