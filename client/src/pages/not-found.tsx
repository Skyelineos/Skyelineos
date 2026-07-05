import { Link } from 'wouter';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle, Home } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-brand-cream px-4">
      <Card className="w-full max-w-md bg-brand-beige border-brand-light-gray-blue">
        <CardContent className="pt-8 pb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-white text-brand-gold">
            <AlertCircle className="h-7 w-7" />
          </div>
          <h1 className="font-heading text-2xl sm:text-3xl font-semibold text-brand-black tracking-tight">
            Page not found
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            The page you&apos;re looking for doesn&apos;t exist or has been moved.
          </p>
          <div className="mt-6 flex justify-center">
            <Link href="/">
              <Button className="bg-brand-gold hover:bg-brand-gold-dark text-white border-brand-gold">
                <Home className="h-4 w-4 mr-2" />
                Back to dashboard
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
