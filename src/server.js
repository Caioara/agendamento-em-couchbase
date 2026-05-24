require("dotenv").config();

const path = require("path");
const express = require("express");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const bcrypt = require("bcryptjs");
const { initMongo, toObjectId } = require("./mongo");

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "dev-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production"
    },
    store: MongoStore.create({
      mongoUrl: process.env.MONGODB_URI,
      dbName: process.env.MONGODB_DB || "agendamentos"
    })
  })
);

const ROLES = ["admin", "professional", "client"];

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function safeUser(user) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt
  };
}

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Nao autenticado." });
  }
  return next();
}

function requireRole(roles) {
  return (req, res, next) => {
    if (!roles.includes(req.session.role)) {
      return res.status(403).json({ error: "Acesso negado." });
    }
    return next();
  };
}

function parseISODate(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

function validateEvent(payload) {
  const errors = [];
  if (!payload.title || typeof payload.title !== "string") {
    errors.push("title");
  }
  if (!payload.startAt || !parseISODate(payload.startAt)) {
    errors.push("startAt");
  }
  if (typeof payload.durationMinutes !== "number" || payload.durationMinutes < 15) {
    errors.push("durationMinutes");
  }
  if (typeof payload.capacity !== "number" || payload.capacity < 1) {
    errors.push("capacity");
  }
  if (payload.location && typeof payload.location !== "string") {
    errors.push("location");
  }
  return errors;
}

app.post("/api/auth/register", async (req, res) => {
  try {
    const { users } = await initMongo();
    const name = String(req.body.name || "").trim();
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || "");
    const role = ROLES.includes(req.body.role) ? req.body.role : "client";

    const errors = [];
    if (!name) errors.push("name");
    if (!email || !email.includes("@")) errors.push("email");
    if (password.length < 6) errors.push("password");

    if (errors.length > 0) {
      return res.status(400).json({ error: "Campos invalidos.", fields: errors });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const doc = {
      name,
      email,
      passwordHash,
      role,
      createdAt: new Date().toISOString()
    };

    const result = await users.insertOne(doc);
    req.session.userId = result.insertedId.toString();
    req.session.role = role;
    req.session.name = name;

    return res.status(201).json({ user: safeUser({ _id: result.insertedId, ...doc }) });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: "Email ja cadastrado." });
    }
    return res.status(500).json({ error: error.message });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { users } = await initMongo();
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || "");

    const user = await users.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: "Credenciais invalidas." });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return res.status(401).json({ error: "Credenciais invalidas." });
    }

    req.session.userId = user._id.toString();
    req.session.role = user.role;
    req.session.name = user.name;

    return res.json({ user: safeUser(user) });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post("/api/auth/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

app.get("/api/auth/me", async (req, res) => {
  if (!req.session.userId) {
    return res.json({ user: null });
  }

  try {
    const { users } = await initMongo();
    const user = await users.findOne({ _id: toObjectId(req.session.userId) });
    if (!user) {
      return res.json({ user: null });
    }
    return res.json({ user: safeUser(user) });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get("/api/events", async (req, res) => {
  try {
    const { events } = await initMongo();
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    const query = String(req.query.q || "").trim();
    const from = req.query.from ? parseISODate(req.query.from) : null;
    const to = req.query.to ? parseISODate(req.query.to) : null;

    const filter = { status: "open" };
    if (query) {
      filter.$text = { $search: query };
    }
    if (from || to) {
      filter.startAt = {};
      if (from) filter.startAt.$gte = from.toISOString();
      if (to) filter.startAt.$lte = to.toISOString();
    }

    const [total, items] = await Promise.all([
      events.countDocuments(filter),
      events
        .find(filter)
        .sort({ startAt: 1 })
        .skip(offset)
        .limit(limit)
        .toArray()
    ]);

    return res.json({
      items: items.map((item) => ({ id: item._id.toString(), ...item })),
      total,
      limit,
      offset
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get("/api/events/mine", requireAuth, requireRole(["admin", "professional"]), async (req, res) => {
  try {
    const { events } = await initMongo();
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    const filter = { createdBy: req.session.userId };

    const [total, items] = await Promise.all([
      events.countDocuments(filter),
      events
        .find(filter)
        .sort({ startAt: -1 })
        .skip(offset)
        .limit(limit)
        .toArray()
    ]);

    return res.json({
      items: items.map((item) => ({ id: item._id.toString(), ...item })),
      total,
      limit,
      offset
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get("/api/events/:id", async (req, res) => {
  try {
    const { events, enrollments } = await initMongo();
    const objectId = toObjectId(req.params.id);
    if (!objectId) {
      return res.status(400).json({ error: "Id invalido." });
    }

    const event = await events.findOne({ _id: objectId });
    if (!event) {
      return res.status(404).json({ error: "Evento nao encontrado." });
    }

    const enrolled = await enrollments.countDocuments({
      eventId: event._id,
      status: "active"
    });

    return res.json({
      id: event._id.toString(),
      ...event,
      enrolled
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post("/api/events", requireAuth, requireRole(["admin", "professional"]), async (req, res) => {
  try {
    const errors = validateEvent(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ error: "Campos invalidos.", fields: errors });
    }

    const { events } = await initMongo();
    const start = parseISODate(req.body.startAt);
    const end = new Date(start.getTime() + req.body.durationMinutes * 60000);

    const conflict = await events.findOne({
      createdBy: req.session.userId,
      status: "open",
      startAt: { $lt: end.toISOString() },
      endAt: { $gt: start.toISOString() }
    });

    if (conflict) {
      return res.status(409).json({ error: "Conflito de horario com outro evento." });
    }

    const doc = {
      title: String(req.body.title).trim(),
      description: String(req.body.description || "").trim(),
      location: String(req.body.location || "").trim(),
      startAt: start.toISOString(),
      endAt: end.toISOString(),
      durationMinutes: req.body.durationMinutes,
      capacity: req.body.capacity,
      status: "open",
      createdBy: req.session.userId,
      createdAt: new Date().toISOString(),
      updatedAt: null
    };

    const result = await events.insertOne(doc);
    return res.status(201).json({ id: result.insertedId.toString(), ...doc });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.put("/api/events/:id", requireAuth, requireRole(["admin", "professional"]), async (req, res) => {
  try {
    const { events } = await initMongo();
    const objectId = toObjectId(req.params.id);
    if (!objectId) {
      return res.status(400).json({ error: "Id invalido." });
    }

    const event = await events.findOne({ _id: objectId });
    if (!event) {
      return res.status(404).json({ error: "Evento nao encontrado." });
    }

    if (req.session.role !== "admin" && event.createdBy !== req.session.userId) {
      return res.status(403).json({ error: "Acesso negado." });
    }

    const payload = { ...req.body };
    const errors = validateEvent({
      title: payload.title || event.title,
      startAt: payload.startAt || event.startAt,
      durationMinutes: payload.durationMinutes ?? event.durationMinutes,
      capacity: payload.capacity ?? event.capacity,
      location: payload.location || event.location
    });

    if (errors.length > 0) {
      return res.status(400).json({ error: "Campos invalidos.", fields: errors });
    }

    const start = parseISODate(payload.startAt || event.startAt);
    const duration = payload.durationMinutes ?? event.durationMinutes;
    const end = new Date(start.getTime() + duration * 60000);

    const conflict = await events.findOne({
      _id: { $ne: event._id },
      createdBy: event.createdBy,
      status: "open",
      startAt: { $lt: end.toISOString() },
      endAt: { $gt: start.toISOString() }
    });

    if (conflict) {
      return res.status(409).json({ error: "Conflito de horario com outro evento." });
    }

    const update = {
      title: String(payload.title || event.title).trim(),
      description: String(payload.description ?? event.description).trim(),
      location: String(payload.location ?? event.location).trim(),
      startAt: start.toISOString(),
      endAt: end.toISOString(),
      durationMinutes: duration,
      capacity: payload.capacity ?? event.capacity,
      updatedAt: new Date().toISOString()
    };

    await events.updateOne({ _id: event._id }, { $set: update });
    return res.json({ id: event._id.toString(), ...event, ...update });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.delete("/api/events/:id", requireAuth, requireRole(["admin", "professional"]), async (req, res) => {
  try {
    const { events } = await initMongo();
    const objectId = toObjectId(req.params.id);
    if (!objectId) {
      return res.status(400).json({ error: "Id invalido." });
    }

    const event = await events.findOne({ _id: objectId });
    if (!event) {
      return res.status(404).json({ error: "Evento nao encontrado." });
    }

    if (req.session.role !== "admin" && event.createdBy !== req.session.userId) {
      return res.status(403).json({ error: "Acesso negado." });
    }

    await events.updateOne(
      { _id: event._id },
      { $set: { status: "cancelled", updatedAt: new Date().toISOString() } }
    );

    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post("/api/events/:id/enroll", requireAuth, requireRole(["client"]), async (req, res) => {
  try {
    const { events, enrollments } = await initMongo();
    const objectId = toObjectId(req.params.id);
    if (!objectId) {
      return res.status(400).json({ error: "Id invalido." });
    }

    const event = await events.findOne({ _id: objectId, status: "open" });
    if (!event) {
      return res.status(404).json({ error: "Evento nao encontrado." });
    }

    const enrolled = await enrollments.countDocuments({
      eventId: event._id,
      status: "active"
    });

    if (enrolled >= event.capacity) {
      return res.status(409).json({ error: "Evento lotado." });
    }

    const existing = await enrollments.findOne({
      eventId: event._id,
      userId: req.session.userId
    });

    if (existing && existing.status === "active") {
      return res.status(409).json({ error: "Ja inscrito." });
    }

    const reminderMinutes = typeof req.body.reminderMinutes === "number"
      ? req.body.reminderMinutes
      : 1440;

    if (existing) {
      const update = {
        status: "active",
        reminderMinutes,
        cancelledAt: null
      };

      await enrollments.updateOne({ _id: existing._id }, { $set: update });
      return res.status(200).json({ id: existing._id.toString(), ...existing, ...update });
    }

    const doc = {
      eventId: event._id,
      userId: req.session.userId,
      status: "active",
      reminderMinutes,
      createdAt: new Date().toISOString(),
      cancelledAt: null
    };

    const result = await enrollments.insertOne(doc);
    return res.status(201).json({ id: result.insertedId.toString(), ...doc });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: "Ja inscrito." });
    }
    return res.status(500).json({ error: error.message });
  }
});

app.get("/api/enrollments/me", requireAuth, async (req, res) => {
  try {
    const { enrollments } = await initMongo();
    const items = await enrollments
      .aggregate([
        { $match: { userId: req.session.userId, status: "active" } },
        {
          $lookup: {
            from: "events",
            localField: "eventId",
            foreignField: "_id",
            as: "event"
          }
        },
        { $unwind: "$event" },
        { $sort: { createdAt: -1 } }
      ])
      .toArray();

    return res.json({
      items: items.map((item) => ({
        id: item._id.toString(),
        status: item.status,
        reminderMinutes: item.reminderMinutes,
        createdAt: item.createdAt,
        cancelledAt: item.cancelledAt,
        event: { id: item.event._id.toString(), ...item.event }
      }))
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get(
  "/api/enrollments/all",
  requireAuth,
  requireRole(["admin", "professional"]),
  async (req, res) => {
    try {
      const { enrollments } = await initMongo();
      const items = await enrollments
        .aggregate([
          {
            $addFields: {
              userObjectId: { $toObjectId: "$userId" }
            }
          },
          {
            $lookup: {
              from: "users",
              localField: "userObjectId",
              foreignField: "_id",
              as: "user"
            }
          },
          {
            $lookup: {
              from: "events",
              localField: "eventId",
              foreignField: "_id",
              as: "event"
            }
          },
          { $unwind: "$event" },
          { $unwind: "$user" },
          { $sort: { createdAt: -1 } }
        ])
        .toArray();

      return res.json({
        items: items.map((item) => ({
          id: item._id.toString(),
          status: item.status,
          reminderMinutes: item.reminderMinutes,
          createdAt: item.createdAt,
          cancelledAt: item.cancelledAt,
          event: { id: item.event._id.toString(), ...item.event },
          user: {
            id: item.user._id.toString(),
            name: item.user.name,
            email: item.user.email,
            role: item.user.role
          }
        }))
      });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }
);

app.post("/api/enrollments/:id/cancel", requireAuth, async (req, res) => {
  try {
    const { enrollments } = await initMongo();
    const objectId = toObjectId(req.params.id);
    if (!objectId) {
      return res.status(400).json({ error: "Id invalido." });
    }

    const enrollment = await enrollments.findOne({ _id: objectId });
    if (!enrollment) {
      return res.status(404).json({ error: "Inscricao nao encontrada." });
    }

    if (enrollment.userId !== req.session.userId) {
      return res.status(403).json({ error: "Acesso negado." });
    }

    await enrollments.updateOne(
      { _id: enrollment._id },
      { $set: { status: "cancelled", cancelledAt: new Date().toISOString() } }
    );

    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get("/api/reminders/upcoming", requireAuth, async (req, res) => {
  try {
    const { enrollments } = await initMongo();
    const windowHours = Math.min(Math.max(parseInt(req.query.hours, 10) || 24, 1), 168);
    const now = new Date();
    const later = new Date(now.getTime() + windowHours * 60 * 60 * 1000);

    const items = await enrollments
      .aggregate([
        { $match: { userId: req.session.userId, status: "active" } },
        {
          $lookup: {
            from: "events",
            localField: "eventId",
            foreignField: "_id",
            as: "event"
          }
        },
        { $unwind: "$event" },
        {
          $match: {
            "event.startAt": { $gte: now.toISOString(), $lte: later.toISOString() }
          }
        },
        { $sort: { "event.startAt": 1 } }
      ])
      .toArray();

    return res.json({
      items: items.map((item) => ({
        id: item._id.toString(),
        reminderMinutes: item.reminderMinutes,
        event: { id: item.event._id.toString(), ...item.event }
      }))
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});
