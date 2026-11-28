import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { MongoDBAdapter } from "@auth/mongodb-adapter";
import bcrypt from "bcryptjs";
import { clientPromise } from "@/lib/mongodb/adapter-client";
import { connectToDatabase } from "@/lib/mongodb/client";
import { User } from "@/models";
import { credentialsSchema, nativeGoogleSchema } from "@/lib/validations/auth";
import { verifyNativeGoogleIdToken } from "@/lib/auth/google-identity";
import { checkRequestRateLimit, rateLimitResponse } from "@/lib/security/rate-limit";

const providers = [
  ...(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET
    ? [Google({ clientId: process.env.AUTH_GOOGLE_ID, clientSecret: process.env.AUTH_GOOGLE_SECRET })]
    : []),
  ...(process.env.AUTH_GOOGLE_ID ? [Credentials({
    id: "native-google",
    name: "Native Google",
    credentials: { idToken: { label: "Google ID token", type: "text" } },
    async authorize(rawCredentials, request) {
      const limited = rateLimitResponse(await checkRequestRateLimit(request, { scope: "auth:native-google", limit: 8, windowMs: 15 * 60 * 1000 }));
      if (limited) return null;
      const parsed = nativeGoogleSchema.safeParse(rawCredentials);
      if (!parsed.success) return null;
      const identity = await verifyNativeGoogleIdToken(parsed.data.idToken, process.env.AUTH_GOOGLE_ID!);
      if (!identity) return null;

      await connectToDatabase();
      let user = await User.findOne({ email: identity.email }).exec();
      if (!user) {
        try {
          user = await User.create({
            name: identity.name,
            email: identity.email,
            emailVerified: new Date(),
            image: identity.image,
          });
        } catch (error) {
          if (!(error && typeof error === "object" && "code" in error && error.code === 11000)) throw error;
          user = await User.findOne({ email: identity.email }).exec();
        }
      }
      if (!user) return null;
      if (!user.emailVerified) {
        await User.updateOne({ _id: user._id, email: identity.email }, { $set: { emailVerified: new Date() } });
      }
      return { id: user._id.toString(), name: user.name, email: user.email, image: user.image ?? null };
    },
  })] : []),
  Credentials({
    name: "Email and password",
    credentials: { email: { label: "Email", type: "email" }, password: { label: "Password", type: "password" } },
    async authorize(rawCredentials, request) {
      const limitResponse = rateLimitResponse(await checkRequestRateLimit(request, { scope: "auth:credentials", limit: 8, windowMs: 15 * 60 * 1000 }));
      if (limitResponse) return null;
      const parsed = credentialsSchema.safeParse(rawCredentials);
      if (!parsed.success) return null;
      await connectToDatabase();
      const user = await User.findOne({ email: parsed.data.email }).select("+passwordHash");
      if (!user?.passwordHash) return null;
      if (!(await bcrypt.compare(parsed.data.password, user.passwordHash))) return null;
      return { id: user._id.toString(), name: user.name, email: user.email };
    },
  }),
];

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: MongoDBAdapter(clientPromise, { databaseName: process.env.MONGODB_DB_NAME ?? "omr_exam_checker" }),
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers,
  callbacks: {
    session({ session, token }) {
      if (session.user && token.sub) session.user.id = token.sub;
      return session;
    },
  },
  secret: process.env.AUTH_SECRET,
});
