import { Star } from 'lucide-react';
import { Empty, PageHeader } from '../components/ui';
import { ViolationCard } from '../components/ViolationCard';
import { useApp } from '../store';

export function Favorites() {
  const app = useApp();
  const list = app.user.favorites.map((f) => app.byId.get(f.id)).filter(Boolean);
  return (
    <div className="safe-bottom">
      <PageHeader back={false} title="المفضلة" subtitle={`${list.length} مخالفة محفوظة`} right={list.length > 0 && (
        <button onClick={() => confirm('إزالة جميع المخالفات من المفضلة؟') && app.clearFavorites()} className="rounded-full bg-white/10 px-3 py-1.5 text-[13.5px]">مسح الكل</button>
      )} />
      <main className="mx-auto flex max-w-3xl flex-col gap-2.5 px-3 pt-3">
        {list.length ? list.map((v, i) => <ViolationCard key={v!.id} v={v!} index={i} />)
          : <Empty icon={<Star className="size-8" />} title="لا توجد مخالفات في المفضلة" text="اضغط على النجمة في صفحة أي مخالفة لإضافتها هنا والوصول إليها بسرعة، حتى دون إنترنت." />}
      </main>
    </div>
  );
}
