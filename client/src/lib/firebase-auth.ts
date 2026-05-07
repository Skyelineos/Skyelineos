import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  signOut,
  updateProfile,
  User 
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase';

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  firstName: string;
  lastName: string;
  role: string;
  isActive: boolean;
  createdAt?: any;
  updatedAt?: any;
}

export const signIn = async (email: string, password: string): Promise<User> => {
  const result = await signInWithEmailAndPassword(auth, email, password);
  return result.user;
};

export const register = async (
  email: string, 
  password: string, 
  fullName: string,
  role: string = 'client'
): Promise<User> => {
  const result = await createUserWithEmailAndPassword(auth, email, password);
  const user = result.user;
  
  // Update the user's display name
  await updateProfile(user, { displayName: fullName });
  
  // Create user profile in Firestore
  const [firstName, ...lastNameParts] = fullName.split(' ');
  const lastName = lastNameParts.join(' ');
  
  const userProfile: Omit<UserProfile, 'id'> = {
    email: user.email!,
    fullName,
    firstName,
    lastName,
    role,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  
  await setDoc(doc(db, 'users', user.uid), userProfile);
  
  return user;
};

export const logout = async (): Promise<void> => {
  await signOut(auth);
};

export const getUserProfile = async (uid: string): Promise<UserProfile | null> => {
  const userDoc = await getDoc(doc(db, 'users', uid));
  if (userDoc.exists()) {
    return { id: uid, ...userDoc.data() } as UserProfile;
  }
  return null;
};