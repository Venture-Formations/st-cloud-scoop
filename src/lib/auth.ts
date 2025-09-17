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
      if (account?.provider === 'google') {
        try {
          // First, create or get user in Supabase auth
          const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email: user.email!,
            email_confirm: true,
            user_metadata: {
              name: user.name,
              avatar_url: user.image,
            }
          })

          if (authError && authError.message !== 'User already registered') {
            console.error('Error creating auth user:', authError)
            return false
          }

          let supabaseUserId = authData?.user?.id

          if (!supabaseUserId && authError && authError.message === 'User already registered') {
            // User already exists, get their ID
            const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers()
            supabaseUserId = existingUsers.users.find(u => u.email === user.email)?.id
          }

          if (!supabaseUserId) {
            console.error('Could not get Supabase user ID')
            return false
          }

          // Check if user exists in our users table
          const { data: existingUser } = await supabaseAdmin
            .from('users')
            .select('*')
            .eq('email', user.email)
            .single()

          if (!existingUser) {
            // Create new user in our users table
            const { error } = await supabaseAdmin
              .from('users')
              .insert([
                {
                  id: supabaseUserId,
                  email: user.email!,
                  name: user.name,
                  role: 'reviewer',
                  last_login: new Date().toISOString(),
                  is_active: true,
                },
              ])

            if (error) {
              console.error('Error creating user in users table:', error)
              // Don't fail auth if users table doesn't exist yet
              console.log('Users table may not exist yet - continuing with auth')
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
          // Don't fail auth during setup phase
          console.log('Allowing auth during setup phase')
          return true
        }
      }
      return true
    },
    async jwt({ token, user }) {
      if (user) {
        try {
          // Fetch user role from database
          const { data: dbUser } = await supabaseAdmin
            .from('users')
            .select('role, is_active')
            .eq('email', user.email)
            .single()

          if (dbUser) {
            token.role = dbUser.role
            token.isActive = dbUser.is_active
          } else {
            // Default values if users table doesn't exist or user not found
            token.role = 'reviewer'
            token.isActive = true
          }
        } catch (error) {
          console.error('Error fetching user role:', error)
          // Default values during setup
          token.role = 'reviewer'
          token.isActive = true
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
}