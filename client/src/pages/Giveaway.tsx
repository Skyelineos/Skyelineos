import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';

// Public, no-auth giveaway page. Displays whatever design the team uploaded via
// Content Studio → Giveaway Page (stored at public_content/giveaway). The
// giveaway QR on the model-home sign points here, so the design can be swapped
// anytime without reprinting the sign.

export default function Giveaway() {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'public_content', 'giveaway'), snap => {
      setImageUrl(snap.exists() ? (snap.data() as any).imageUrl || null : null);
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, []);

  return (
    <div style={{ backgroundColor: '#141414' }} className="min-h-screen flex items-center justify-center p-4">
      {loading ? (
        <div className="w-8 h-8 border-2 border-gray-600 border-t-[#C9A96E] rounded-full animate-spin" />
      ) : imageUrl ? (
        <img
          src={imageUrl}
          alt="Skyeline Homes Giveaway"
          className="max-w-full max-h-screen object-contain rounded-lg shadow-2xl"
        />
      ) : (
        <div className="text-center space-y-4 max-w-md">
          <img src="/logos/logo-transparent.png" alt="Skyeline Homes" className="h-24 mx-auto object-contain" style={{ filter: 'brightness(0) invert(1)' }} />
          <h1 className="text-2xl font-bold text-white">Our Giveaway Is Coming Soon</h1>
          <p className="text-gray-400">
            Check back shortly — details on the current Skyeline Homes giveaway will appear here.
          </p>
        </div>
      )}
    </div>
  );
}
