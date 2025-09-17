import NextAuth from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import { supabaseAdmin } from '@/lib/supabase'
import type { User } from '@/types/database'

const handler = NextAuth({
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider === 'google') {
        try {
          // Check if user exists in our database
          const { data: existingUser } = await supabaseAdmin
            .from('users')
            .select('*')
            .eq('email', user.email)
            .single()

          if (!existingUser) {
            // Create new user
            const { error } = await supabaseAdmin
              .from('users')
              .insert([
                {
                  id: user.id,
                  email: user.email!,
                  name: user.name,
                  role: 'reviewer',
                  last_login: new Date().toISOString(),
                  is_active: true,
                },
              ])

            if (error) {
              console.error('Error creating user:', error)
              return false
            }
          } else {
            // Update last login
            await supabaseAdmin
              .from('users')
              .update({ last_login: new Date().toISOString() })
              .eq('id', existingUser.id)
          }

          return true
        } catch (error) {
          console.error('Error in signIn callback:', error)
          return false
        }
      }
      return true
    },
    async jwt({ token, user }) {
      if (user) {
        // Fetch user role from database
        const { data: dbUser } = await supabaseAdmin
          .from('users')
          .select('role, is_active')
          .eq('email', user.email)
          .single()

        if (dbUser) {
          token.role = dbUser.role
          token.isActive = dbUser.is_active
        }
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.role = token.role as string
        session.user.isActive = token.isActive as boolean
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
})

export { handler as GET, handler as POST }