import { vi } from 'vitest';

// In-memory mock for PrismaClient used by the Phase 1 unit tests.
const store = {
  users: new Map(),
  payments: new Map(),
  portfolioItems: new Map(),
  analyses: new Map(),
};

const calls = {
  userUpdate: [],
  paymentUpdate: [],
};

let nextId = 1;
function newId() {
  return nextId++;
}

function reset() {
  store.users.clear();
  store.payments.clear();
  store.portfolioItems.clear();
  store.analyses.clear();
  calls.userUpdate = [];
  calls.paymentUpdate = [];
  nextId = 1;
}

const prismaMock = {
  __store: store,
  __calls: calls,
  __reset: reset,

  user: {
    findUnique: vi.fn(async ({ where }) => {
      if (where.id !== undefined) {
        return [...store.users.values()].find((u) => u.id === where.id) || null;
      }
      if (where.email !== undefined) {
        return [...store.users.values()].find((u) => u.email === where.email) || null;
      }
      if (where.emailVerifyToken !== undefined) {
        return [...store.users.values()].find((u) => u.emailVerifyToken === where.emailVerifyToken) || null;
      }
      if (where.passwordResetToken !== undefined) {
        return [...store.users.values()].find((u) => u.passwordResetToken === where.passwordResetToken) || null;
      }
      return null;
    }),
    findMany: vi.fn(async () => [...store.users.values()]),
    create: vi.fn(async ({ data }) => {
      const user = { id: newId(), tokenVersion: 0, ...data };
      store.users.set(user.id, user);
      return user;
    }),
    update: vi.fn(async ({ where, data }) => {
      const user = [...store.users.values()].find((u) => u.id === where.id);
      if (!user) throw new Error('Record not found');
      applyUpdate(user, data);
      calls.userUpdate.push({ id: user.id, data });
      return user;
    }),
  },

  payment: {
    findUnique: vi.fn(async ({ where }) => store.payments.get(where.id) || null),
    findFirst: vi.fn(async ({ where }) => {
      const p = store.payments.get(where.id);
      if (!p) return null;
      return p.userId === where.userId ? p : null;
    }),
    create: vi.fn(async ({ data }) => {
      const payment = { id: newId(), ...data };
      store.payments.set(payment.id, payment);
      return payment;
    }),
    update: vi.fn(async ({ where, data }) => {
      const p = store.payments.get(where.id);
      if (!p) throw new Error('Record not found');
      applyUpdate(p, data);
      calls.paymentUpdate.push({ id: p.id, data });
      return p;
    }),
  },

  portfolioItem: {
    findMany: vi.fn(async () => []),
    create: vi.fn(async ({ data }) => {
      const item = { id: newId(), ...data };
      store.portfolioItems.set(item.id, item);
      return item;
    }),
    deleteMany: vi.fn(async () => ({ count: 1 })),
  },

  analysis: {
    findUnique: vi.fn(async ({ where }) => store.analyses.get(where.id) || null),
    findFirst: vi.fn(async ({ where }) => {
      const a = store.analyses.get(where.id);
      if (!a) return null;
      return a.userId === where.userId ? a : null;
    }),
    findMany: vi.fn(async ({ where }) =>
      [...store.analyses.values()].filter((a) => (where?.userId ? a.userId === where.userId : true))
    ),
    create: vi.fn(async ({ data }) => {
      const analysis = { id: newId(), status: 'pending', ...data };
      store.analyses.set(analysis.id, analysis);
      return analysis;
    }),
    update: vi.fn(async ({ where, data }) => {
      const a = store.analyses.get(where.id);
      if (!a) throw new Error('Record not found');
      applyUpdate(a, data);
      return a;
    }),
  },

  $transaction: vi.fn(async (fn) => fn(prismaMock)),
  $queryRaw: vi.fn(async () => [{ '?column?': 1 }]),
};

/**
 * Apply a Prisma-style update payload to an in-memory record, translating
 * atomic operations ({ increment, decrement, set, multiply, divide }) into
 * plain mutations. Real Prisma does this server-side; the mock has to mimic
 * it or `{ increment: 1 }` objects leak into rendered data.
 */
function applyUpdate(record, data) {
  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value === 'object' && !Array.isArray(value) && !Buffer.isBuffer(value)) {
      if ('increment' in value) record[key] = (record[key] || 0) + value.increment;
      else if ('decrement' in value) record[key] = (record[key] || 0) - value.decrement;
      else if ('set' in value) record[key] = value.set;
      else if ('multiply' in value) record[key] = (record[key] || 0) * value.multiply;
      else if ('divide' in value) record[key] = (record[key] || 0) / value.divide;
      else Object.assign(record, { [key]: value });
    } else {
      record[key] = value;
    }
  }
}

export const prisma = prismaMock;
