/**
 * LGDX Dev Seed — создаёт дефолтных пользователей и продукты для разработки фронтенда.
 * Запускается из docker-compose после старта lgdx-server-dev.
 * Идемпотентен: при повторном запуске не дублирует пользователей.
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');

const API_BASE = process.env.SEED_API_URL || 'http://lgdx-server-dev:5000';
const API = `${API_BASE}/api`;
const TIMEOUT = 60000;
const WAIT_FOR_SERVER_MS = 30000;
const WAIT_AFTER_UPLOAD_MS = 20000;
const ADMIN_SECRET_KEY = process.env.ADMIN_SECRET_KEY;

// Root админ, через которого мы будем создавать LGDeal INC + её админа
const ROOT_ADMIN = {
  email: 'root-admin@dev.local',
  password: 'Password123',
  firstName: 'Root',
  lastName: 'Admin',
  phone: '+15550000000',
};

// LGDeal компания + админ
const LGDEAL_COMPANY = {
  name: 'LGDeal INC',
  description: 'Development LGDeal company (auto-seeded)',
  adminEmail: 'lgdeal-admin@dev.local',
  adminPassword: 'Password123',
  adminFirstName: 'LGDeal',
  adminLastName: 'Admin',
  adminPhone: '+15550000001',
};

const DEV_USERS = [
  {
    role: 'seller',
    email: 'seller1@dev.local',
    password: 'Password123',
    firstName: 'Seller',
    lastName: 'One',
    companyName: 'Dev Seller Company A',
    phone: '+15551000001',
  },
  {
    role: 'seller',
    email: 'seller2@dev.local',
    password: 'Password123',
    firstName: 'Seller',
    lastName: 'Two',
    companyName: 'Dev Seller Company B',
    phone: '+15551000002',
  },
  {
    role: 'buyer',
    email: 'buyer1@dev.local',
    password: 'Password123',
    firstName: 'Buyer',
    lastName: 'One',
    companyName: 'Dev Buyer Company A',
    phone: '+15552000001',
  },
  {
    role: 'buyer',
    email: 'buyer2@dev.local',
    password: 'Password123',
    firstName: 'Buyer',
    lastName: 'Two',
    companyName: 'Dev Buyer Company B',
    phone: '+15552000002',
  },
];

function log(msg) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${msg}`);
}

async function waitForServer() {
  const deadline = Date.now() + WAIT_FOR_SERVER_MS;
  while (Date.now() < deadline) {
    try {
      const res = await axios.get(`${API_BASE}/health`, { timeout: 5000 });
      if (res.status === 200) {
        log('Server is up.');
        return true;
      }
    } catch (_) {}
    log('Waiting for server...');
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error('Server did not become ready in time');
}

async function login(email, password) {
  const { data } = await axios.post(
    `${API}/auth/login`,
    { login: email, password },
    { timeout: TIMEOUT, validateStatus: () => true }
  );
  return data.token ? { token: data.token, user: data.user } : null;
}

async function register(user) {
  const { data } = await axios.post(`${API}/auth/register`, user, {
    timeout: TIMEOUT,
    validateStatus: () => true,
  });
  if (data.token && data.user) {
    return { token: data.token, user: data.user };
  }
  throw new Error(data.message || data.error || 'Registration failed');
}

async function createRootAdmin() {
  if (!ADMIN_SECRET_KEY) {
    throw new Error('ADMIN_SECRET_KEY is not set for dev-seed');
  }

  log(`Creating root admin via /auth/create-admin: ${ROOT_ADMIN.email}`);
  const { data, status } = await axios.post(
    `${API}/auth/create-admin`,
    {
      email: ROOT_ADMIN.email,
      password: ROOT_ADMIN.password,
      firstName: ROOT_ADMIN.firstName,
      lastName: ROOT_ADMIN.lastName,
      phone: ROOT_ADMIN.phone,
      adminKey: ADMIN_SECRET_KEY,
    },
    { timeout: TIMEOUT, validateStatus: () => true }
  );

  if (data?.token && data?.user) {
    return { token: data.token, user: data.user };
  }

  if (status === 400 && (data?.message || data?.error || '').toLowerCase().includes('already exists')) {
    log(`Root admin already exists, logging in: ${ROOT_ADMIN.email}`);
    const existing = await login(ROOT_ADMIN.email, ROOT_ADMIN.password);
    if (existing) return { token: existing.token, user: existing.user };
  }

  throw new Error(data?.message || data?.error || 'Failed to create root admin via /auth/create-admin');
}

async function ensureLgdealCompanyAdmin(rootAdminToken) {
  // Если админ уже существует — ничего не делаем
  const existing = await login(LGDEAL_COMPANY.adminEmail, LGDEAL_COMPANY.adminPassword);
  if (existing) {
    log(`LGDeal admin already exists: ${LGDEAL_COMPANY.adminEmail}`);
    return { token: existing.token, user: existing.user };
  }

  log(`Creating LGDeal INC company + admin via /admin/companies`);
  const { data, status } = await axios.post(
    `${API}/admin/companies`,
    {
      name: LGDEAL_COMPANY.name,
      description: LGDEAL_COMPANY.description,
      userEmail: LGDEAL_COMPANY.adminEmail,
      userPhone: LGDEAL_COMPANY.adminPhone,
      userFirstName: LGDEAL_COMPANY.adminFirstName,
      userLastName: LGDEAL_COMPANY.adminLastName,
      userPassword: LGDEAL_COMPANY.adminPassword,
      // В компании он будет как supervisor, потом поднимем до admin через /admin/users/:id/role
      userRole: 'supervisor',
      companyRoles: ['buyer', 'seller'],
    },
    {
      timeout: TIMEOUT,
      validateStatus: () => true,
      headers: {
        'x-auth-token': rootAdminToken,
      },
    }
  );

  if (status !== 201 || !data?.user || !data?.company) {
    const msg = data?.message || data?.error || `Failed to create LGDeal INC company (status ${status})`;
    if (status === 403) {
      throw new Error(
        `${msg} Root admin (${ROOT_ADMIN.email}) must have role admin. Create via POST /api/auth/create-admin with ADMIN_SECRET_KEY or remove the user from DB.`
      );
    }
    throw new Error(msg);
  }

  const lgdealUserId = data.user?.id || data.user?._id;
  if (lgdealUserId) {
    try {
      // Повышаем роль до admin через админский API
      await axios.put(
        `${API}/admin/users/${lgdealUserId}/role`,
        { role: 'admin' },
        {
          timeout: TIMEOUT,
          validateStatus: () => true,
          headers: { 'x-auth-token': rootAdminToken },
        }
      );
      log(
        `LGDeal INC created with active status and admin user ${LGDEAL_COMPANY.adminEmail} (role=admin)`
      );
    } catch (e) {
      log(
        `LGDeal INC created, but failed to upgrade role to admin for ${LGDEAL_COMPANY.adminEmail}: ${
          e.message || e
        }`
      );
    }
  }

  // Логинимся, чтобы вернуть нормальный токен для последующей работы, если понадобится
  const loginResult = await login(LGDEAL_COMPANY.adminEmail, LGDEAL_COMPANY.adminPassword);
  if (!loginResult) {
    throw new Error('LGDeal admin created but login failed');
  }
  return loginResult;
}

async function ensureUser(userSpec) {
  const existing = await login(userSpec.email, userSpec.password);
  if (existing) {
    log(`User already exists: ${userSpec.email}`);
    return { ...userSpec, token: existing.token, userId: existing.user._id };
  }
  log(`Registering: ${userSpec.email}`);
  const result = await register(userSpec);
  return {
    ...userSpec,
    token: result.token,
    userId: result.user._id,
  };
}

function getInventoryCount(token) {
  return axios
    .get(`${API}/inventory`, {
      headers: { 'x-auth-token': token },
      timeout: TIMEOUT,
      validateStatus: () => true,
    })
    .then((res) => res.data?.pagination?.total ?? res.data?.products?.length ?? 0)
    .catch(() => 0);
}

function buildSellerCsv(sellerIndex) {
  const prefix = `CERT-DEV-S${sellerIndex}`;
  const header =
    'certificateNumber,shape,carat,color,clarity,price,pricePerCarat,location,technology,photo,video,measurements,tableSize,totalDepth,fluorescence,status';
  const rows = [
    [prefix + '-001', 'Round', 1.5, 'G', 'VS1', 12750, 8500, 'India', 'Lab Grown', 'https://example.com/p1.jpg', 'https://example.com/v1.mp4', '6.5x6.5x4.0', 58, 62.5, 'None', 'available'].join(','),
    [prefix + '-002', 'Round', 2.0, 'F', 'VVS2', 24000, 12000, 'India', 'Lab Grown', 'https://example.com/p2.jpg', 'https://example.com/v2.mp4', '7.0x7.0x4.2', 60, 63.0, 'None', 'available'].join(','),
    [prefix + '-003', 'Oval', 1.8, 'E', 'VS1', 18000, 10000, 'India', 'Lab Grown', 'https://example.com/p3.jpg', 'https://example.com/v3.mp4', '8.5x6.0x3.8', 58, 62.0, 'None', 'available'].join(','),
    [prefix + '-004', 'Cushion', 2.5, 'H', 'VS2', 20000, 8000, 'India', 'Lab Grown', 'https://example.com/p4.jpg', 'https://example.com/v4.mp4', '7.5x7.0x4.5', 65, 68.0, 'None', 'available'].join(','),
    [prefix + '-005', 'Princess', 1.2, 'D', 'VVS1', 18000, 15000, 'India', 'Lab Grown', 'https://example.com/p5.jpg', 'https://example.com/v5.mp4', '5.5x5.5x4.0', 70, 72.0, 'None', 'available'].join(','),
  ];
  return [header, ...rows].join('\n');
}

async function uploadInventory(seller, sellerIndex) {
  const count = await getInventoryCount(seller.token);
  if (count > 0) {
    log(`Seller ${seller.email} already has ${count} products, skipping upload.`);
    return;
  }
  const csv = buildSellerCsv(sellerIndex);
  const form = new FormData();
  form.append('file', Buffer.from(csv, 'utf8'), {
    filename: `dev-seed-s${sellerIndex}.csv`,
    contentType: 'text/csv',
  });
  const res = await axios.post(`${API}/inventory/upload`, form, {
    headers: {
      ...form.getHeaders(),
      'x-auth-token': seller.token,
    },
    timeout: TIMEOUT,
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
    validateStatus: (s) => s === 202 || s === 200,
  });
  log(`Upload for ${seller.email} accepted (${res.status}). Processing in background.`);
}

async function main() {
  log('LGDX Dev Seed starting.');
  await waitForServer();

  // 1. Root admin + LGDeal INC с активной компанией и полностью верифицированным админом
  let rootAdmin;
  try {
    rootAdmin = await createRootAdmin();
  } catch (e) {
    log(`Failed to ensure root admin: ${e.message || e}`);
    throw e;
  }

  try {
    await ensureLgdealCompanyAdmin(rootAdmin.token);
  } catch (e) {
    log(`Failed to ensure LGDeal INC admin/company: ${e.message || e}`);
    throw e;
  }

  // 2. Обычные dev-пользователи для сценариев покупатель/продавец
  const users = [];
  for (let i = 0; i < DEV_USERS.length; i++) {
    const u = await ensureUser(DEV_USERS[i]);
    users.push(u);
  }

  const sellers = users.filter((u) => u.role === 'seller');
  for (let i = 0; i < sellers.length; i++) {
    await uploadInventory(sellers[i], i + 1);
  }

  if (sellers.length > 0) {
    log(`Waiting ${WAIT_AFTER_UPLOAD_MS / 1000}s for file import to process...`);
    await new Promise((r) => setTimeout(r, WAIT_AFTER_UPLOAD_MS));
  }

  log('Dev seed completed.');
  log('Accounts (password for all: Password123):');
  log(`  admin (root): ${ROOT_ADMIN.email}`);
  log(`  admin (LGDeal INC): ${LGDEAL_COMPANY.adminEmail}`);
  DEV_USERS.forEach((u) => log(`  ${u.role}: ${u.email}`));
}

main().catch((err) => {
  console.error('Seed failed:', err.message || err);
  process.exit(1);
});
