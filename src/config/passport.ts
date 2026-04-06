import passport from 'passport';
import { Strategy as GoogleStrategy, type Profile } from 'passport-google-oauth20';
import { env } from './env.js';
import { UserModel } from '../models/user.model.js';

const GOOGLE_CALLBACK_PATH = '/auth/google/callback';

function googleProfileToUser(profile: Profile) {
  const email = profile.emails?.[0]?.value?.toLowerCase();
  if (!email) {
    throw new Error('Google account did not provide an email address.');
  }

  const avatar = profile.photos?.[0]?.value;
  const displayName = profile.displayName?.trim() || email;

  return {
    googleId: profile.id,
    email,
    avatar,
    name: displayName,
    provider: 'google' as const
  };
}

export function initializePassport(): void {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    return;
  }

  passport.use(
    new GoogleStrategy(
      {
        clientID: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        callbackURL: `${env.API_BASE_URL}${GOOGLE_CALLBACK_PATH}`
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const profileData = googleProfileToUser(profile);

          let user = await UserModel.findOne({
            $or: [{ googleId: profileData.googleId }, { email: profileData.email }]
          });

          if (!user) {
            user = await UserModel.create(profileData);
          } else {
            user.googleId = profileData.googleId;
            user.provider = 'google';
            user.name = user.name || profileData.name;
            user.avatar = profileData.avatar;
            await user.save();
          }

          done(null, { id: String(user._id) });
        } catch (error) {
          done(error as Error);
        }
      }
    )
  );

  passport.serializeUser<{ id: string }>((user, done) => {
    done(null, user.id);
  });

  passport.deserializeUser<string>(async (id, done) => {
    try {
      const user = await UserModel.findById(id).select('_id name email avatar provider createdAt');
      if (!user) {
        return done(null, false);
      }
      return done(null, {
        id: String(user._id),
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        provider: user.provider,
        createdAt: user.createdAt.toISOString()
      });
    } catch (error) {
      return done(error as Error);
    }
  });
}

export function isGoogleOAuthConfigured(): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}
