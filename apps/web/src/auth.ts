import NextAuth, { type Provider } from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { MongoDBAdapter } from "@auth/mongodb-adapter";
import bcrypt from "bcryptjs";
import { clientPromise } from "@/lib/mongodb/adapter-client";
import { connectToDatabase } from "@/lib/mongodb/client";
import { User } from "@/models";
import { credentialsSchema } from "@/lib/validations/auth";

const providers: Provider[] = [];
if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  providers.push(Google({ clientId: process.env.AUTH_GOOGLE_ID, clientSecret: process.env.AUTH_GOOGLE_SECRET }));
}
providers.push(Credentials({
  name: "Email and password",
  credentials: { email: { label: "Email", type: "email" }, password: { label: "Password", type: "password" } },
  async authorize(rawCredentials) {
    const parsed = credentialsSchema.safeParse(rawCredentials);
    if (!parsed.success) return null;
    await connectToDatabase();
    const user = await User.findOne({ email: parsed.data.email }).select("+passwordHash");
    if (!user?.passwordHash) return null;
    if (!(await bcrypt.compare(parsed.data.password, user.passwordHash))) return null;
    return { id: user._id.toString(), name: user.name, email: user.email };
  },
}));

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
