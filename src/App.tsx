import { useState } from 'react';
import { FileSpreadsheet } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { StatusBar } from '@/features/shell/StatusBar';

/**
 * Placeholder shell (Task 1.1). Task 1.10 replaces this with the file workflow.
 */
export default function App() {
  const [greeted, setGreeted] = useState(false);

  return (
    <main className="flex h-full flex-col">
      <header className="flex items-center gap-2 border-b px-4 py-2">
        <FileSpreadsheet className="size-4 text-muted-foreground" aria-hidden />
        <h1 className="text-sm font-semibold">xlsform-studio</h1>
      </header>
      <section className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
        <p className="text-muted-foreground text-sm">Foundation shell is running.</p>
        <Button onClick={() => setGreeted(true)}>
          {greeted ? 'Tailwind and shadcn/ui render' : 'Verify UI'}
        </Button>
      </section>
      <StatusBar />
    </main>
  );
}
