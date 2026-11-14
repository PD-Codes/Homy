import { defineModule } from '@/sdk';

defineModule({
  type: 'spacer',
  name: { de: 'Abstandshalter', en: 'Spacer' },
  description: { de: 'Leerer Platzhalter für das Layout', en: 'Empty placeholder for layout' },
  icon: 'grid',
  category: 'essentials',
  size: { w: 4, h: 2 },
  chromeless: true,
  schema: [],
  component: ({ ctx }) => (ctx.editing ? <div class="w-state">{ctx.t('Abstand', 'Spacer')}</div> : null),
});
