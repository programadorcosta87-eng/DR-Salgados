import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

interface RecipeItem {
  ingredientId: string;
  quantity: number; // e.g. 0.05 (kg/l) or 1 (unit)
}

interface Ingredient {
  id: string;
  name: string;
  unit: string; // e.g. "kg", "g", "un", "L", "ml"
  currentStock: number;
  minStock: number;
  costPerUnit: number; // cost per 1 unit of measure
}

interface MenuItem {
  id: string;
  name: string;
  price: number;
  description: string;
  category: string;
  image: string;
  costPrice?: number; // Preço de custo para relatórios financeiros
  recipe?: RecipeItem[];
}

interface Customer {
  id: string;
  name: string;
  points: number;
  totalSpent: number;
  createdAt: string;
  lastOrderAt?: string;
}

interface Banner {
  id: string;
  imageUrl: string;
  title?: string;
  active: boolean;
}

interface Order {
  id: string;
  table: string;
  customerName?: string;
  items: Array<{
    id: string;
    name: string;
    qty: number;
    price: number;
  }>;
  total: number;
  timestamp: string;
  status: "pending" | "preparing" | "ready" | "completed";
  orderType?: "retirada" | "entrega";
  deliveryFee?: number;
  paymentMethod?: "pix" | "caixa";
  pointsEarned?: number;
  pointsRedeemed?: number;
  discountApplied?: number;
  scheduledTime?: string; // ex: "18:30" ou undefined
  stockDeducted?: boolean;
}

interface Employee {
  id: string;
  name: string;
  username: string;
  // Senha nunca deve ser armazenada em texto puro.
  // password existe apenas para migração de bancos antigos e é removida após a migração.
  password?: string;
  passwordHash?: string;
  role: "admin" | "cozinha" | "garcom" | "financeiro";
}

interface DB {
  config: {
    whatsapp: string;
    adminPassword: string;
    isOpen: boolean;
    categories: string[];
    deliveryFee?: number;
    pixKey?: string;
    pixQrCodeImage?: string;
    pointsPerReal?: number;
    pointValueInReal?: number;
    loyaltySystemEnabled?: boolean;
    
    // Novas customizações
    logoUrl?: string;
    primaryColor?: string;
    fontFamily?: string;
    banners?: Banner[];
    
    // Níveis de Fidelidade
    silverMinPoints?: number;
    goldMinPoints?: number;
    silverBenefit?: string;
    goldBenefit?: string;
    
    // Analytics
    views?: number;
    cartsCreated?: number;
  };
  items: MenuItem[];
  orders: Order[];
  customers: Customer[];
  employees?: Employee[];
  ingredients?: Ingredient[];
}

const DB_FILE = path.join(process.cwd(), "db.json");

function getAdminPassword(): string {
  const password = process.env.ADMIN_PASSWORD?.trim();
  if (!password || password.length < 8) {
    throw new Error(
      "ADMIN_PASSWORD não configurada. Defina uma senha com pelo menos 8 caracteres nas variáveis de ambiente."
    );
  }
  return password;
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  try {
    const [salt, key] = storedHash.split(":");
    if (!salt || !key) return false;

    const derivedKey = scryptSync(password, salt, 64);
    const storedKey = Buffer.from(key, "hex");

    if (derivedKey.length !== storedKey.length) return false;
    return timingSafeEqual(derivedKey, storedKey);
  } catch {
    return false;
  }
}

function sanitizeEmployee(employee: Employee) {
  const { password: _password, passwordHash: _passwordHash, ...safeEmployee } = employee;
  return safeEmployee;
}

const defaultDB: DB = {
  config: {
    whatsapp: "5511999999999", // Default dummy Brazilian WhatsApp number
    adminPassword: "",         // A senha do administrador vem de ADMIN_PASSWORD
    isOpen: true,
    categories: ["Salgados", "Doces", "Bebidas"],
    deliveryFee: 5.00,
    pixKey: "sua-chave-pix@exemplo.com",
    pixQrCodeImage: "",
    pointsPerReal: 1.0,
    pointValueInReal: 0.10,
    loyaltySystemEnabled: true,
    logoUrl: "",
    primaryColor: "#3b82f6",
    fontFamily: "Inter",
    banners: [],
    silverMinPoints: 100,
    goldMinPoints: 300,
    silverBenefit: "discount_5",
    goldBenefit: "free_delivery",
    views: 0,
    cartsCreated: 0
  },
  items: [
    {
      id: "1",
      name: "Coxinha de Frango com Catupiry",
      price: 8.50,
      description: "Coxinha super crocante por fora e incrivelmente macia por dentro, recheada com peito de frango desfiado temperado e o autêntico requeijão Catupiry cremoso.",
      category: "Salgados",
      image: "https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?w=500&q=80"
    },
    {
      id: "2",
      name: "Kibe Frito com Queijo",
      price: 8.00,
      description: "Kibe frito artesanal na hora, com casca crocante de trigo temperada com hortelã fresca e recheado com muçarela derretida super cremosa.",
      category: "Salgados",
      image: "https://images.unsplash.com/photo-1541518763669-27fef04b14ea?w=500&q=80"
    },
    {
      id: "3",
      name: "Empada de Palmito Cremosa",
      price: 9.00,
      description: "Nossa tradicional empada com massa podre amanteigada que derrete na boca, recheio farto de palmito bem cremoso e temperado.",
      category: "Salgados",
      image: "https://images.unsplash.com/photo-1551024601-bec78aea704b?w=500&q=80"
    },
    {
      id: "4",
      name: "Pastel Especial de Carne Seca",
      price: 10.00,
      description: "Pastel com massa caseira super sequinha e crocante, recheado com carne seca desfiada de primeira e requeijão cremoso.",
      category: "Salgados",
      image: "https://images.unsplash.com/photo-1608219990951-a49ac6c51844?w=500&q=80"
    },
    {
      id: "5",
      name: "Brigadeiro Gourmet Belga",
      price: 4.50,
      description: "Clássico brigadeiro brasileiro feito com cacau belga 50%, leite condensado de alta qualidade e granulados de chocolate nobre.",
      category: "Doces",
      image: "https://images.unsplash.com/photo-1575444758702-4a6b9222336e?w=500&q=80"
    },
    {
      id: "6",
      name: "Coxinha de Morango",
      price: 7.50,
      description: "Morango fresco e suculento envolto por uma generosa camada do nosso brigadeiro gourmet de chocolate e granulado belga.",
      category: "Doces",
      image: "https://images.unsplash.com/photo-1607349913338-fca6f7fc42d0?w=500&q=80"
    },
    {
      id: "7",
      name: "Fatia de Bolo Prestígio",
      price: 12.00,
      description: "Massa super molhadinha de chocolate 100% cacau, com recheio cremoso de coco ralado fresco e cobertura trufada deliciosa.",
      category: "Doces",
      image: "https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=500&q=80"
    },
    {
      id: "8",
      name: "Coca-Cola Lata 350ml",
      price: 6.00,
      description: "Refrigerante Coca-Cola em lata de 350ml, servido trincando de gelado com opção de gelo e limão.",
      category: "Bebidas",
      image: "https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=500&q=80"
    },
    {
      id: "9",
      name: "Suco Natural de Laranja 400ml",
      price: 8.50,
      description: "Suco de laranja 100% puro e natural, espremido na hora da fruta fresca. Rico em vitamina C e sem adição de conservantes.",
      category: "Bebidas",
      image: "https://images.unsplash.com/photo-1621506289937-a8e4df240d0b?w=500&q=80"
    },
    {
      id: "10",
      name: "Água Mineral Fresca 500ml",
      price: 4.00,
      description: "Garrafa de água mineral puríssima de 500ml, gelada. Escolha com ou sem gás no momento do consumo.",
      category: "Bebidas",
      image: "https://images.unsplash.com/photo-1608885898957-a599fb15e47a?w=500&q=80"
    }
  ],
  orders: [],
  customers: [],
  employees: [],
  ingredients: []
};

// Helper functions to read/write DB
function getDB(): DB {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(defaultDB, null, 2), "utf-8");
    return defaultDB;
  }
  try {
    const content = fs.readFileSync(DB_FILE, "utf-8");
    const parsed = JSON.parse(content);
    
    // Auto-migrate new fields
    if (!parsed.customers) {
      parsed.customers = [];
    }
    if (!parsed.employees) {
      parsed.employees = [];
    }
    if (!parsed.config) {
      parsed.config = {};
    }
    if (parsed.config.pointsPerReal === undefined) {
      parsed.config.pointsPerReal = 1.0;
    }
    if (parsed.config.pointValueInReal === undefined) {
      parsed.config.pointValueInReal = 0.10;
    }
    if (parsed.config.loyaltySystemEnabled === undefined) {
      parsed.config.loyaltySystemEnabled = true;
    }
    if (parsed.config.pixQrCodeImage === undefined) {
      parsed.config.pixQrCodeImage = "";
    }
    if (parsed.config.logoUrl === undefined) {
      parsed.config.logoUrl = "";
    }
    if (parsed.config.primaryColor === undefined) {
      parsed.config.primaryColor = "#3b82f6";
    }
    if (parsed.config.fontFamily === undefined) {
      parsed.config.fontFamily = "Inter";
    }
    if (parsed.config.banners === undefined) {
      parsed.config.banners = [];
    }
    if (parsed.config.silverMinPoints === undefined) {
      parsed.config.silverMinPoints = 100;
    }
    if (parsed.config.goldMinPoints === undefined) {
      parsed.config.goldMinPoints = 300;
    }
    if (parsed.config.silverBenefit === undefined) {
      parsed.config.silverBenefit = "discount_5";
    }
    if (parsed.config.goldBenefit === undefined) {
      parsed.config.goldBenefit = "free_delivery";
    }
    if (parsed.config.views === undefined) {
      parsed.config.views = 0;
    }
    if (parsed.config.cartsCreated === undefined) {
      parsed.config.cartsCreated = 0;
    }
    
    // Auto-migrate ingredients & recipes
    if (!parsed.ingredients || parsed.ingredients.length === 0) {
      parsed.ingredients = [
        { id: "ing1", name: "Farinha de Trigo", unit: "kg", currentStock: 25.0, minStock: 5.0, costPerUnit: 4.50 },
        { id: "ing2", name: "Carne Moída", unit: "kg", currentStock: 15.0, minStock: 3.0, costPerUnit: 28.00 },
        { id: "ing3", name: "Queijo Muçarela", unit: "kg", currentStock: 20.0, minStock: 4.0, costPerUnit: 35.00 },
        { id: "ing4", name: "Frango Desfiado", unit: "kg", currentStock: 18.0, minStock: 4.0, costPerUnit: 18.50 },
        { id: "ing5", name: "Requeijão Catupiry", unit: "kg", currentStock: 10.0, minStock: 2.0, costPerUnit: 25.00 },
        { id: "ing6", name: "Morango Fresco", unit: "caixa", currentStock: 8.0, minStock: 2.0, costPerUnit: 6.00 }
      ];
    }
    if (parsed.items) {
      parsed.items.forEach((item: any) => {
        if (!item.recipe) {
          if (item.id === "1") {
            item.recipe = [
              { ingredientId: "ing1", quantity: 0.10 },
              { ingredientId: "ing4", quantity: 0.08 },
              { ingredientId: "ing5", quantity: 0.04 }
            ];
          } else if (item.id === "2") {
            item.recipe = [
              { ingredientId: "ing2", quantity: 0.12 },
              { ingredientId: "ing3", quantity: 0.05 }
            ];
          } else if (item.id === "6") {
            item.recipe = [
              { ingredientId: "ing1", quantity: 0.05 },
              { ingredientId: "ing6", quantity: 0.10 }
            ];
          } else {
            item.recipe = [];
          }
        }
        // Sync item costPrice based on recipe
        let recipeCost = 0;
        item.recipe.forEach((r: any) => {
          const ing = parsed.ingredients.find((ig: any) => ig.id === r.ingredientId);
          if (ing) {
            recipeCost += (r.quantity * ing.costPerUnit);
          }
        });
        if (recipeCost > 0) {
          item.costPrice = Number(recipeCost.toFixed(2));
        }
      });
    }
    
    // Migração de segurança: converte senhas antigas em texto puro para hashes.
    // O campo password é removido do objeto antes de persistir o banco.
    let passwordsMigrated = false;
    if (Array.isArray(parsed.employees)) {
      parsed.employees.forEach((employee: any) => {
        if (!employee.passwordHash && typeof employee.password === "string" && employee.password.length > 0) {
          employee.passwordHash = hashPassword(employee.password);
          delete employee.password;
          passwordsMigrated = true;
        }
      });
    }

    if (passwordsMigrated) {
      saveDB(parsed);
    }

    return parsed;
  } catch (err) {
    console.error("Error reading database file, using defaults:", err);
    return defaultDB;
  }
}

function saveDB(db: DB) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf-8");
  } catch (err) {
    console.error("Error writing database file:", err);
  }
}

function deductStockForOrder(db: DB, order: Order) {
  if (order.stockDeducted) return;

  const items = db.items || [];
  const ingredients = db.ingredients || [];

  for (const orderItem of order.items) {
    const menuItem = items.find(p => p.id === orderItem.id || p.name === orderItem.name);
    if (menuItem && menuItem.recipe && menuItem.recipe.length > 0) {
      for (const recipeItem of menuItem.recipe) {
        const ingredient = ingredients.find(ing => ing.id === recipeItem.ingredientId);
        if (ingredient) {
          ingredient.currentStock -= (recipeItem.quantity * orderItem.qty);
          if (ingredient.currentStock < 0) {
            ingredient.currentStock = 0;
          }
        }
      }
    }
  }
  order.stockDeducted = true;
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // Body parsers with generous limits
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true, limit: "10mb" }));

  // Middleware to authenticate requests (Admin & Staff)
  const authMiddleware = (req: any, res: express.Response, next: express.NextFunction) => {
    const password = req.headers["x-admin-password"];
    if (!password) {
      return res.status(401).json({ error: "Credenciais de acesso ausentes." });
    }
    
    const db = getDB();
    
    // Check master admin password
    if (password === getAdminPassword()) {
      req.userRole = "admin";
      req.userId = "admin";
      return next();
    }
    
    // Check custom employees using password hashes.
    const employees = db.employees || [];
    const emp = employees.find(e =>
      typeof password === "string" &&
      typeof e.passwordHash === "string" &&
      verifyPassword(password, e.passwordHash)
    );
    if (emp) {
      req.userRole = emp.role;
      req.userId = emp.id;
      return next();
    }
    
    res.status(401).json({ error: "Credenciais inválidas ou acesso negado." });
  };

  // Middleware to enforce strict Admin-only access
  const requireAdmin = (req: any, res: express.Response, next: express.NextFunction) => {
    if (req.userRole === "admin") {
      next();
    } else {
      res.status(403).json({ error: "Acesso negado. Apenas o administrador geral pode realizar esta ação." });
    }
  };

  // --- API ROUTES ---

  // Get full menu and categories
  app.get("/api/menu", (req, res) => {
    const db = getDB();
    res.json({
      items: db.items,
      categories: db.config.categories,
      isOpen: db.config.isOpen,
      deliveryFee: db.config.deliveryFee !== undefined ? db.config.deliveryFee : 5.00,
      pixKey: db.config.pixKey || "",
      pixQrCodeImage: db.config.pixQrCodeImage || "",
      pointsPerReal: db.config.pointsPerReal !== undefined ? db.config.pointsPerReal : 1.0,
      pointValueInReal: db.config.pointValueInReal !== undefined ? db.config.pointValueInReal : 0.10,
      loyaltySystemEnabled: db.config.loyaltySystemEnabled !== undefined ? db.config.loyaltySystemEnabled : true,
      
      // Customizations
      logoUrl: db.config.logoUrl || "",
      primaryColor: db.config.primaryColor || "#3b82f6",
      fontFamily: db.config.fontFamily || "Inter",
      banners: db.config.banners || [],
      silverMinPoints: db.config.silverMinPoints !== undefined ? db.config.silverMinPoints : 100,
      goldMinPoints: db.config.goldMinPoints !== undefined ? db.config.goldMinPoints : 300,
      silverBenefit: db.config.silverBenefit || "discount_5",
      goldBenefit: db.config.goldBenefit || "free_delivery"
    });
  });

  // Get config info (public metadata)
  app.get("/api/config", (req, res) => {
    const db = getDB();
    res.json({
      whatsapp: db.config.whatsapp,
      isOpen: db.config.isOpen,
      deliveryFee: db.config.deliveryFee !== undefined ? db.config.deliveryFee : 5.00,
      pixKey: db.config.pixKey || "",
      pixQrCodeImage: db.config.pixQrCodeImage || "",
      pointsPerReal: db.config.pointsPerReal !== undefined ? db.config.pointsPerReal : 1.0,
      pointValueInReal: db.config.pointValueInReal !== undefined ? db.config.pointValueInReal : 0.10,
      loyaltySystemEnabled: db.config.loyaltySystemEnabled !== undefined ? db.config.loyaltySystemEnabled : true,
      
      // Customizations
      logoUrl: db.config.logoUrl || "",
      primaryColor: db.config.primaryColor || "#3b82f6",
      fontFamily: db.config.fontFamily || "Inter",
      banners: db.config.banners || [],
      silverMinPoints: db.config.silverMinPoints !== undefined ? db.config.silverMinPoints : 100,
      goldMinPoints: db.config.goldMinPoints !== undefined ? db.config.goldMinPoints : 300,
      silverBenefit: db.config.silverBenefit || "discount_5",
      goldBenefit: db.config.goldBenefit || "free_delivery"
    });
  });

  // Verify Admin or Employee Password
  app.post("/api/admin/login", (req, res) => {
    const { username, password } = req.body;
    const db = getDB();
    
    // If username is empty or "admin", authenticate against the master admin password
    if (!username || username.trim() === "" || username.trim().toLowerCase() === "admin") {
      if (password === getAdminPassword()) {
        return res.json({ 
          success: true, 
          message: "Login efetuado com sucesso.", 
          role: "admin", 
          name: "Administrador Geral" 
        });
      } else {
        return res.status(401).json({ success: false, error: "Senha de administrador incorreta." });
      }
    }
    
    // Otherwise, check in custom employees list
    const employees = db.employees || [];
    const emp = employees.find(e => e.username.trim().toLowerCase() === username.trim().toLowerCase());
    
    if (emp) {
      if (emp.passwordHash && verifyPassword(password, emp.passwordHash)) {
        return res.json({ 
          success: true, 
          message: "Login efetuado com sucesso.", 
          role: emp.role, 
          name: emp.name 
        });
      } else {
        return res.status(401).json({ success: false, error: "Senha incorreta." });
      }
    }
    
    res.status(401).json({ success: false, error: "Usuário não encontrado." });
  });

  // Client lookup customer points by name
  app.get("/api/customers/lookup", (req, res) => {
    const name = req.query.name;
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "Nome do cliente é obrigatório." });
    }
    
    const db = getDB();
    const nameKey = name.trim().toUpperCase();
    const customer = db.customers.find(c => c.name.trim().toUpperCase() === nameKey);
    
    if (customer) {
      res.json({ success: true, customer: customer ? { name: customer.name, points: customer.points } : null });
    } else {
      res.json({ success: true, customer: null });
    }
  });

  // Client creates a new order
  app.post("/api/orders", (req, res) => {
    const { table, items, total, orderType, deliveryFee, paymentMethod, customerName, pointsRedeemed, discountApplied, scheduledTime } = req.body;
    
    const normOrderType = orderType || "retirada";
    if (!items || !items.length) {
      return res.status(400).json({ error: "Itens do pedido são necessários." });
    }
    if (normOrderType === "mesa" && !table) {
      return res.status(400).json({ error: "Número da mesa é necessário para pedidos de mesa." });
    }

    const db = getDB();
    
    let earned = 0;
    const redeemed = Number(pointsRedeemed) || 0;
    const discount = Number(discountApplied) || 0;
    const normCustomerName = customerName ? customerName.trim() : "";

    // Process Loyalty points if enabled and customerName is provided
    if (db.config.loyaltySystemEnabled && normCustomerName) {
      const nameKey = normCustomerName.toUpperCase();
      let customer = db.customers.find(c => c.name.trim().toUpperCase() === nameKey);
      
      const rate = db.config.pointsPerReal !== undefined ? db.config.pointsPerReal : 1.0;
      // Points earned based on order total (usually subtotal before or after discount, let's do pre-delivery fee total minus discount)
      const valueToCalculatePoints = Math.max(0, Number(total) - discount);
      earned = Math.floor(valueToCalculatePoints * rate);

      if (!customer) {
        customer = {
          id: Math.random().toString(36).substring(2, 9),
          name: normCustomerName,
          points: earned,
          totalSpent: Number(total),
          createdAt: new Date().toISOString(),
          lastOrderAt: new Date().toISOString()
        };
        db.customers.push(customer);
      } else {
        customer.totalSpent += Number(total);
        customer.lastOrderAt = new Date().toISOString();
        // Deduct redeemed points and add new points earned
        customer.points = Math.max(0, customer.points - redeemed) + earned;
      }
    }

    const newOrder: Order = {
      id: Math.random().toString(36).substring(2, 9).toUpperCase(),
      table: table ? String(table) : (normOrderType === "entrega" ? "Delivery" : "Retirada"),
      customerName: normCustomerName || undefined,
      items,
      total: Number(total),
      timestamp: new Date().toISOString(),
      status: "pending",
      orderType: normOrderType,
      deliveryFee: deliveryFee !== undefined ? Number(deliveryFee) : 0,
      paymentMethod: paymentMethod || "caixa",
      pointsEarned: earned || undefined,
      pointsRedeemed: redeemed || undefined,
      discountApplied: discount || undefined,
      scheduledTime: scheduledTime || undefined
    };

    db.orders.unshift(newOrder); // Add to the beginning of orders array
    saveDB(db);

    res.json({ success: true, order: newOrder });
  });

  // Get multiple orders status by ID for Meus Pedidos
  app.get("/api/orders/status", (req, res) => {
    const idsString = req.query.ids;
    if (!idsString || typeof idsString !== "string") {
      return res.json([]);
    }
    const ids = idsString.split(",").map(id => id.trim().toUpperCase());
    const db = getDB();
    const ordersMatched = db.orders.filter(o => ids.includes(o.id.toUpperCase()));
    res.json(ordersMatched);
  });

  // Ping for online active users
  const activeUsers = new Map<string, number>();
  app.post("/api/analytics/ping", (req, res) => {
    const { sessionId } = req.body;
    if (sessionId) {
      activeUsers.set(sessionId, Date.now());
    }
    
    // Clean up users inactive for > 15 seconds
    const now = Date.now();
    for (const [id, lastSeen] of activeUsers.entries()) {
      if (now - lastSeen > 15000) {
        activeUsers.delete(id);
      }
    }
    
    res.json({ success: true, activeUsersCount: Math.max(1, activeUsers.size) });
  });

  // Track pageviews
  app.post("/api/analytics/pageview", (req, res) => {
    const db = getDB();
    if (db.config.views === undefined) db.config.views = 0;
    db.config.views++;
    saveDB(db);
    res.json({ success: true, views: db.config.views });
  });

  // Track cart additions
  app.post("/api/analytics/cart-created", (req, res) => {
    const db = getDB();
    if (db.config.cartsCreated === undefined) db.config.cartsCreated = 0;
    db.config.cartsCreated++;
    saveDB(db);
    res.json({ success: true, cartsCreated: db.config.cartsCreated });
  });

  // ADMIN ONLY ROUTES (Protected by password)

  // Get all orders (Admin panel)
  app.get("/api/admin/orders", authMiddleware, (req, res) => {
    const db = getDB();
    res.json(db.orders);
  });

  // Get professional analytics metrics (Admin panel)
  app.get("/api/admin/analytics", authMiddleware, (req, res) => {
    const db = getDB();
    
    // Clean up users inactive for > 15 seconds
    const now = Date.now();
    for (const [id, lastSeen] of activeUsers.entries()) {
      if (now - lastSeen > 15000) {
        activeUsers.delete(id);
      }
    }

    res.json({
      views: db.config.views || 0,
      cartsCreated: db.config.cartsCreated || 0,
      activeUsersCount: Math.max(1, activeUsers.size)
    });
  });

  // Delete/Complete an order
  app.delete("/api/admin/orders/:id", authMiddleware, (req, res) => {
    const { id } = req.params;
    const db = getDB();
    const orderIndex = db.orders.findIndex(o => o.id === id);
    if (orderIndex === -1) {
      return res.status(404).json({ error: "Pedido não encontrado." });
    }
    
    // Remove the order from the list
    db.orders.splice(orderIndex, 1);
    saveDB(db);
    res.json({ success: true, message: "Pedido removido com sucesso." });
  });

  // Complete an order (Update status)
  app.patch("/api/admin/orders/:id/complete", authMiddleware, (req, res) => {
    const { id } = req.params;
    const db = getDB();
    const order = db.orders.find(o => o.id === id);
    if (!order) {
      return res.status(404).json({ error: "Pedido não encontrado." });
    }
    order.status = "completed";
    deductStockForOrder(db, order);
    saveDB(db);
    res.json({ success: true, order });
  });

  // Update order status generically (e.g. for KDS and custom statuses)
  app.patch("/api/admin/orders/:id/status", authMiddleware, (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    if (!["pending", "preparing", "ready", "completed"].includes(status)) {
      return res.status(400).json({ error: "Status inválido. Deve ser 'pending', 'preparing', 'ready' ou 'completed'." });
    }
    const db = getDB();
    const order = db.orders.find(o => o.id === id);
    if (!order) {
      return res.status(404).json({ error: "Pedido não encontrado." });
    }
    order.status = status;
    if (["preparing", "ready", "completed"].includes(status)) {
      deductStockForOrder(db, order);
    }
    saveDB(db);
    res.json({ success: true, order });
  });

  // Add menu item
  app.post("/api/admin/menu/item", authMiddleware, requireAdmin, (req, res) => {
    const { name, price, description, category, image, costPrice } = req.body;
    if (!name || price === undefined || !category) {
      return res.status(400).json({ error: "Nome, preço e categoria são obrigatórios." });
    }

    const db = getDB();
    const newItem: MenuItem = {
      id: Math.random().toString(36).substring(2, 9),
      name,
      price: Number(price),
      description: description || "",
      category,
      image: image || "https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?w=500&q=80",
      costPrice: costPrice !== undefined ? Number(costPrice) : Math.round(Number(price) * 0.4 * 100) / 100 // default 40% cost if not provided
    };

    db.items.push(newItem);
    saveDB(db);
    res.json({ success: true, item: newItem });
  });

  // Edit menu item
  app.put("/api/admin/menu/item/:id", authMiddleware, requireAdmin, (req, res) => {
    const { id } = req.params;
    const { name, price, description, category, image, costPrice } = req.body;
    
    const db = getDB();
    const item = db.items.find(i => i.id === id);
    if (!item) {
      return res.status(404).json({ error: "Item não encontrado no cardápio." });
    }

    if (name !== undefined) item.name = name;
    if (price !== undefined) item.price = Number(price);
    if (description !== undefined) item.description = description;
    if (category !== undefined) item.category = category;
    if (image !== undefined) item.image = image;
    if (costPrice !== undefined) item.costPrice = Number(costPrice);

    saveDB(db);
    res.json({ success: true, item });
  });

  // Delete menu item
  app.delete("/api/admin/menu/item/:id", authMiddleware, requireAdmin, (req, res) => {
    const { id } = req.params;
    const db = getDB();
    const itemIndex = db.items.findIndex(i => i.id === id);
    if (itemIndex === -1) {
      return res.status(404).json({ error: "Item não encontrado." });
    }

    db.items.splice(itemIndex, 1);
    saveDB(db);
    res.json({ success: true, message: "Item excluído com sucesso." });
  });

  // Add category
  app.post("/api/admin/categories", authMiddleware, requireAdmin, (req, res) => {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Nome da categoria inválido." });
    }

    const db = getDB();
    const cleanName = name.trim();
    if (db.config.categories.includes(cleanName)) {
      return res.status(400).json({ error: "Esta categoria já existe." });
    }

    db.config.categories.push(cleanName);
    saveDB(db);
    res.json({ success: true, categories: db.config.categories });
  });

  // Delete category and optionally its items
  app.delete("/api/admin/categories/:name", authMiddleware, requireAdmin, (req, res) => {
    const { name } = req.params;
    const db = getDB();
    const catIndex = db.config.categories.findIndex(c => c.toLowerCase() === name.toLowerCase());
    if (catIndex === -1) {
      return res.status(404).json({ error: "Categoria não encontrada." });
    }

    db.config.categories.splice(catIndex, 1);
    
    // Move items in this category to 'Outros' or delete them? We'll just filter them out of category or keep them. Let's keep them and mark their category as 'Outros' or first category available.
    const fallbackCategory = db.config.categories[0] || "Geral";
    if (!db.config.categories.includes(fallbackCategory)) {
      db.config.categories.push(fallbackCategory);
    }
    db.items.forEach(item => {
      if (item.category.toLowerCase() === name.toLowerCase()) {
        item.category = fallbackCategory;
      }
    });

    saveDB(db);
    res.json({ success: true, categories: db.config.categories });
  });

  // Reorder categories
  app.put("/api/admin/categories/reorder", authMiddleware, requireAdmin, (req, res) => {
    const { categories } = req.body;
    if (!categories || !Array.isArray(categories)) {
      return res.status(400).json({ error: "Lista de categorias inválida." });
    }
    const db = getDB();
    db.config.categories = categories;
    saveDB(db);
    res.json({ success: true, categories: db.config.categories });
  });

  // Update Settings (WhatsApp, Admin Password, Store Status, Delivery Fee, Pix Key, Pix QR Image, Loyalty Configs, Personalization and Tiers)
  app.post("/api/admin/config", authMiddleware, requireAdmin, (req, res) => {
    const { 
      whatsapp, adminPassword, isOpen, deliveryFee, pixKey, pixQrCodeImage, 
      pointsPerReal, pointValueInReal, loyaltySystemEnabled,
      logoUrl, primaryColor, fontFamily, banners,
      silverMinPoints, goldMinPoints, silverBenefit, goldBenefit
    } = req.body;
    const db = getDB();

    if (whatsapp !== undefined) {
      // Strip non-numbers
      db.config.whatsapp = whatsapp.replace(/\D/g, "");
    }
    // A senha do administrador não é armazenada no banco de dados.
    // Configure ADMIN_PASSWORD no ambiente do servidor.
    if (adminPassword !== undefined) {
      return res.status(400).json({
        error: "A senha do administrador deve ser configurada pela variável de ambiente ADMIN_PASSWORD."
      });
    }
    if (isOpen !== undefined) {
      db.config.isOpen = !!isOpen;
    }
    if (deliveryFee !== undefined) {
      db.config.deliveryFee = Number(deliveryFee);
    }
    if (pixKey !== undefined) {
      db.config.pixKey = pixKey.trim();
    }
    if (pixQrCodeImage !== undefined) {
      db.config.pixQrCodeImage = pixQrCodeImage; // base64 representation or URL
    }
    if (pointsPerReal !== undefined) {
      db.config.pointsPerReal = Number(pointsPerReal);
    }
    if (pointValueInReal !== undefined) {
      db.config.pointValueInReal = Number(pointValueInReal);
    }
    if (loyaltySystemEnabled !== undefined) {
      db.config.loyaltySystemEnabled = !!loyaltySystemEnabled;
    }

    // New Customization fields
    if (logoUrl !== undefined) {
      db.config.logoUrl = logoUrl;
    }
    if (primaryColor !== undefined) {
      db.config.primaryColor = primaryColor;
    }
    if (fontFamily !== undefined) {
      db.config.fontFamily = fontFamily;
    }
    if (banners !== undefined && Array.isArray(banners)) {
      db.config.banners = banners;
    }

    // Níveis de Fidelidade
    if (silverMinPoints !== undefined) {
      db.config.silverMinPoints = Number(silverMinPoints);
    }
    if (goldMinPoints !== undefined) {
      db.config.goldMinPoints = Number(goldMinPoints);
    }
    if (silverBenefit !== undefined) {
      db.config.silverBenefit = silverBenefit;
    }
    if (goldBenefit !== undefined) {
      db.config.goldBenefit = goldBenefit;
    }

    saveDB(db);
    res.json({ success: true, message: "Configurações atualizadas com sucesso." });
  });

  // --- ADMIN CUSTOMERS ENDPOINTS ---
  
  // Get all customers (Admin Panel)
  app.get("/api/admin/customers", authMiddleware, (req, res) => {
    const db = getDB();
    res.json(db.customers || []);
  });

  // Create new customer manually (Admin Panel)
  app.post("/api/admin/customers", authMiddleware, (req, res) => {
    const { name, points, totalSpent } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Nome do cliente é obrigatório." });
    }

    const db = getDB();
    const nameKey = name.trim().toUpperCase();
    const exists = db.customers.some(c => c.name.trim().toUpperCase() === nameKey);
    if (exists) {
      return res.status(400).json({ error: "Já existe um cliente cadastrado com este nome." });
    }

    const newCustomer: Customer = {
      id: Math.random().toString(36).substring(2, 9),
      name: name.trim(),
      points: Number(points) || 0,
      totalSpent: Number(totalSpent) || 0,
      createdAt: new Date().toISOString()
    };

    db.customers.push(newCustomer);
    saveDB(db);
    res.json({ success: true, customer: newCustomer });
  });

  // Edit customer manually (Admin Panel)
  app.put("/api/admin/customers/:id", authMiddleware, (req, res) => {
    const { id } = req.params;
    const { name, points, totalSpent } = req.body;

    const db = getDB();
    const customer = db.customers.find(c => c.id === id);
    if (!customer) {
      return res.status(404).json({ error: "Cliente não encontrado." });
    }

    if (name !== undefined && name.trim()) {
      const nameKey = name.trim().toUpperCase();
      const duplicate = db.customers.some(c => c.id !== id && c.name.trim().toUpperCase() === nameKey);
      if (duplicate) {
        return res.status(400).json({ error: "Já existe outro cliente com este nome." });
      }
      customer.name = name.trim();
    }
    if (points !== undefined) {
      customer.points = Number(points);
    }
    if (totalSpent !== undefined) {
      customer.totalSpent = Number(totalSpent);
    }

    saveDB(db);
    res.json({ success: true, customer });
  });

  // Delete customer manually (Admin Panel)
  app.delete("/api/admin/customers/:id", authMiddleware, (req, res) => {
    const { id } = req.params;
    const db = getDB();
    const customerIdx = db.customers.findIndex(c => c.id === id);
    if (customerIdx === -1) {
      return res.status(404).json({ error: "Cliente não encontrado." });
    }

    db.customers.splice(customerIdx, 1);
    saveDB(db);
    res.json({ success: true, message: "Cliente removido com sucesso." });
  });

  // --- ADMIN EMPLOYEES ENDPOINTS (Admin Only) ---

  // Get all employees
  app.get("/api/admin/employees", authMiddleware, requireAdmin, (req, res) => {
    const db = getDB();
    res.json((db.employees || []).map(sanitizeEmployee));
  });

  // Create new employee
  app.post("/api/admin/employees", authMiddleware, requireAdmin, (req, res) => {
    const { name, username, password, role } = req.body;
    if (!name || !username || !password || !role) {
      return res.status(400).json({ error: "Todos os campos (nome, usuário, senha, perfil) são obrigatórios." });
    }

    const db = getDB();
    if (!db.employees) db.employees = [];

    const exists = db.employees.some(e => e.username.trim().toLowerCase() === username.trim().toLowerCase());
    if (exists) {
      return res.status(400).json({ error: "Este usuário já está cadastrado." });
    }

    const newEmployee: Employee = {
      id: Math.random().toString(36).substring(2, 9),
      name: name.trim(),
      username: username.trim(),
      passwordHash: hashPassword(String(password)),
      role: role
    };

    db.employees.push(newEmployee);
    saveDB(db);
    res.json({ success: true, employee: sanitizeEmployee(newEmployee) });
  });

  // Edit employee
  app.put("/api/admin/employees/:id", authMiddleware, requireAdmin, (req, res) => {
    const { id } = req.params;
    const { name, username, password, role } = req.body;

    const db = getDB();
    const employees = db.employees || [];
    const emp = employees.find(e => e.id === id);
    if (!emp) {
      return res.status(404).json({ error: "Funcionário não encontrado." });
    }

    if (name !== undefined) emp.name = name.trim();
    if (username !== undefined) {
      const exists = employees.some(e => e.id !== id && e.username.trim().toLowerCase() === username.trim().toLowerCase());
      if (exists) {
        return res.status(400).json({ error: "Este usuário já está cadastrado por outro funcionário." });
      }
      emp.username = username.trim();
    }
    if (password !== undefined && String(password).length > 0) emp.passwordHash = hashPassword(String(password));
    if (role !== undefined) emp.role = role;

    saveDB(db);
    res.json({ success: true, employee: sanitizeEmployee(emp) });
  });

  // Delete employee
  app.delete("/api/admin/employees/:id", authMiddleware, requireAdmin, (req, res) => {
    const { id } = req.params;
    const db = getDB();
    const employees = db.employees || [];
    const empIdx = employees.findIndex(e => e.id === id);
    if (empIdx === -1) {
      return res.status(404).json({ error: "Funcionário não encontrado." });
    }

    employees.splice(empIdx, 1);
    db.employees = employees;
    saveDB(db);
    res.json({ success: true, message: "Funcionário removido com sucesso." });
  });

  // --- INGREDIENT & RECIPE ENDPOINTS (ESTOQUE) ---

  // Get all ingredients
  app.get("/api/admin/ingredients", authMiddleware, (req, res) => {
    const db = getDB();
    res.json(db.ingredients || []);
  });

  // Create an ingredient
  app.post("/api/admin/ingredients", authMiddleware, requireAdmin, (req, res) => {
    const { name, unit, currentStock, minStock, costPerUnit } = req.body;
    if (!name || !unit) {
      return res.status(400).json({ error: "Nome e unidade são obrigatórios." });
    }
    const db = getDB();
    if (!db.ingredients) db.ingredients = [];

    const newIngredient: Ingredient = {
      id: "ing_" + Math.random().toString(36).substring(2, 9),
      name: String(name).trim(),
      unit: String(unit).trim(),
      currentStock: Number(currentStock) || 0,
      minStock: Number(minStock) || 0,
      costPerUnit: Number(costPerUnit) || 0
    };

    db.ingredients.push(newIngredient);
    saveDB(db);
    res.status(201).json(newIngredient);
  });

  // Update an ingredient
  app.put("/api/admin/ingredients/:id", authMiddleware, requireAdmin, (req, res) => {
    const { id } = req.params;
    const { name, unit, currentStock, minStock, costPerUnit } = req.body;
    const db = getDB();
    if (!db.ingredients) db.ingredients = [];

    const ingredient = db.ingredients.find(ing => ing.id === id);
    if (!ingredient) {
      return res.status(404).json({ error: "Insumo não encontrado." });
    }

    if (name !== undefined) ingredient.name = String(name).trim();
    if (unit !== undefined) ingredient.unit = String(unit).trim();
    if (currentStock !== undefined) ingredient.currentStock = Number(currentStock);
    if (minStock !== undefined) ingredient.minStock = Number(minStock);
    if (costPerUnit !== undefined) ingredient.costPerUnit = Number(costPerUnit);

    // Recalculate costPrices for all items whose recipe uses this ingredient
    if (db.items) {
      db.items.forEach(item => {
        if (item.recipe && item.recipe.some(r => r.ingredientId === id)) {
          let recipeCost = 0;
          item.recipe.forEach(r => {
            const ing = db.ingredients!.find(ig => ig.id === r.ingredientId);
            if (ing) {
              recipeCost += (r.quantity * ing.costPerUnit);
            }
          });
          item.costPrice = Number(recipeCost.toFixed(2));
        }
      });
    }

    saveDB(db);
    res.json(ingredient);
  });

  // Delete an ingredient
  app.delete("/api/admin/ingredients/:id", authMiddleware, requireAdmin, (req, res) => {
    const { id } = req.params;
    const db = getDB();
    if (!db.ingredients) db.ingredients = [];

    const idx = db.ingredients.findIndex(ing => ing.id === id);
    if (idx === -1) {
      return res.status(404).json({ error: "Insumo não encontrado." });
    }

    db.ingredients.splice(idx, 1);

    // Also remove this ingredient from all product recipes
    if (db.items) {
      db.items.forEach(item => {
        if (item.recipe) {
          item.recipe = item.recipe.filter(r => r.ingredientId !== id);
          
          // Recalculate cost
          let recipeCost = 0;
          item.recipe.forEach(r => {
            const ing = db.ingredients!.find(ig => ig.id === r.ingredientId);
            if (ing) {
              recipeCost += (r.quantity * ing.costPerUnit);
            }
          });
          item.costPrice = recipeCost > 0 ? Number(recipeCost.toFixed(2)) : 0;
        }
      });
    }

    saveDB(db);
    res.json({ success: true, message: "Insumo removido com sucesso." });
  });

  // Update recipe for a menu item
  app.post("/api/admin/menu/item/:id/recipe", authMiddleware, requireAdmin, (req, res) => {
    const { id } = req.params;
    const { recipe } = req.body; // Array of { ingredientId, quantity }
    if (!Array.isArray(recipe)) {
      return res.status(400).json({ error: "A receita deve ser um array." });
    }

    const db = getDB();
    const item = db.items.find(i => i.id === id);
    if (!item) {
      return res.status(404).json({ error: "Item do cardápio não encontrado." });
    }

    item.recipe = recipe.map(r => ({
      ingredientId: String(r.ingredientId),
      quantity: Number(r.quantity) || 0
    }));

    // Recalculate costPrice based on recipe ingredients
    const ingredients = db.ingredients || [];
    let calculatedCost = 0;
    item.recipe.forEach(r => {
      const ing = ingredients.find(i => i.id === r.ingredientId);
      if (ing) {
        calculatedCost += (r.quantity * ing.costPerUnit);
      }
    });
    item.costPrice = Number(calculatedCost.toFixed(2));

    saveDB(db);
    res.json({ success: true, item });
  });

  // Export full database state for client-side persistence and sync
  app.get("/api/admin/db-state", authMiddleware, requireAdmin, (req, res) => {
    try {
      const db = getDB();
      const safeDb = {
        ...db,
        employees: (db.employees || []).map(sanitizeEmployee),
        config: {
          ...db.config,
          adminPassword: undefined
        }
      };
      res.json(safeDb);
    } catch (error: any) {
      res.status(500).json({ error: "Erro ao exportar banco de dados: " + error.message });
    }
  });

  // Restore/Import full database state
  app.post("/api/admin/db-restore", authMiddleware, requireAdmin, (req, res) => {
    try {
      const backupData = req.body;
      if (!backupData || !Array.isArray(backupData.items) || !backupData.config || !Array.isArray(backupData.config.categories)) {
        return res.status(400).json({ error: "Dados de backup inválidos ou malformados." });
      }

      const db = getDB();
      
      // Update database values
      db.items = backupData.items;
      const { adminPassword: _ignoredAdminPassword, ...safeBackupConfig } = backupData.config;
      db.config = { ...db.config, ...safeBackupConfig, adminPassword: "" };
      db.orders = Array.isArray(backupData.orders) ? backupData.orders : db.orders;
      db.customers = Array.isArray(backupData.customers) ? backupData.customers : db.customers;

      if (Array.isArray(backupData.employees)) {
        db.employees = backupData.employees.map((employee: any) => {
          const safeEmployee: Employee = {
            id: String(employee.id || Math.random().toString(36).substring(2, 9)),
            name: String(employee.name || "").trim(),
            username: String(employee.username || "").trim(),
            role: employee.role
          };

          if (typeof employee.passwordHash === "string" && employee.passwordHash.length > 0) {
            safeEmployee.passwordHash = employee.passwordHash;
          } else if (typeof employee.password === "string" && employee.password.length > 0) {
            // Compatibilidade com backups antigos: converte texto puro em hash.
            safeEmployee.passwordHash = hashPassword(employee.password);
          }

          return safeEmployee;
        });
      }

      db.ingredients = Array.isArray(backupData.ingredients) ? backupData.ingredients : db.ingredients;

      saveDB(db);
      res.json({ success: true, message: "Banco de dados restaurado e sincronizado com sucesso!" });
    } catch (error: any) {
      res.status(500).json({ error: "Erro ao restaurar banco de dados: " + error.message });
    }
  });

  // --- VITE MIDDLEWARE OR STATIC FILES ---

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[DR Salgados API] Servidor rodando na porta ${PORT}`);
  });
}

startServer();
