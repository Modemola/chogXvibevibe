import { FIELD_TYPES, TEMPLATES } from '@scout/core';
import { handle } from '@/lib/server';
import { FIELD_DOCS } from '@/lib/fields';

export const GET = () =>
  handle(async () => ({
    templates: Object.values(TEMPLATES),
    fields: Object.entries(FIELD_TYPES).map(([name, type]) => ({ name, type, doc: FIELD_DOCS[name as keyof typeof FIELD_TYPES] })),
  }));
