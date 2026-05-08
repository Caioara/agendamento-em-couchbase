require("dotenv").config();

const path = require("path");
const express = require("express");
const { initMongo, toObjectId } = require("./mongo");

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

function validateCar(payload) {
  const errors = [];

  if (!payload.plate || typeof payload.plate !== "string") {
    errors.push("placa");
  }
  if (!payload.model || typeof payload.model !== "string") {
    errors.push("modelo");
  }
  if (!payload.brand || typeof payload.brand !== "string") {
    errors.push("marca");
  }
  if (typeof payload.year !== "number") {
    errors.push("ano");
  }
  if (!payload.color || typeof payload.color !== "string") {
    errors.push("cor");
  }

  return errors;
}

app.get("/api/cars", async (req, res) => {
  try {
    const { cars } = await initMongo();
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

    const [total, items] = await Promise.all([
      cars.countDocuments({}),
      cars
        .find({})
        .sort({ createdAt: -1 })
        .skip(offset)
        .limit(limit)
        .toArray()
    ]);

    res.json({
      items: items.map((item) => ({ id: item._id.toString(), ...item })),
      total,
      limit,
      offset
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/cars/:id", async (req, res) => {
  try {
    const { cars } = await initMongo();
    const objectId = toObjectId(req.params.id);
    if (!objectId) {
      return res.status(400).json({ error: "Id invalido." });
    }

    const car = await cars.findOne({ _id: objectId });
    if (!car) {
      return res.status(404).json({ error: "Carro nao encontrado." });
    }

    return res.json({ id: car._id.toString(), ...car });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post("/api/cars", async (req, res) => {
  try {
    const errors = validateCar(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ error: "Campos invalidos.", fields: errors });
    }

    const { cars } = await initMongo();
    const doc = {
      plate: req.body.plate,
      model: req.body.model,
      brand: req.body.brand,
      year: req.body.year,
      color: req.body.color,
      createdAt: new Date().toISOString()
    };

    const result = await cars.insertOne(doc);
    return res.status(201).json({ id: result.insertedId.toString(), ...doc });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: "Placa ja cadastrada." });
    }
    return res.status(500).json({ error: error.message });
  }
});

app.put("/api/cars/:id", async (req, res) => {
  try {
    const errors = validateCar(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ error: "Campos invalidos.", fields: errors });
    }

    const { cars } = await initMongo();
    const objectId = toObjectId(req.params.id);
    if (!objectId) {
      return res.status(400).json({ error: "Id invalido." });
    }

    const doc = {
      plate: req.body.plate,
      model: req.body.model,
      brand: req.body.brand,
      year: req.body.year,
      color: req.body.color,
      updatedAt: new Date().toISOString()
    };

    const result = await cars.updateOne({ _id: objectId }, { $set: doc });
    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "Carro nao encontrado." });
    }

    return res.json({ id: req.params.id, ...doc });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: "Placa ja cadastrada." });
    }
    return res.status(500).json({ error: error.message });
  }
});

app.delete("/api/cars/:id", async (req, res) => {
  try {
    const { cars } = await initMongo();
    const objectId = toObjectId(req.params.id);
    if (!objectId) {
      return res.status(400).json({ error: "Id invalido." });
    }

    const result = await cars.deleteOne({ _id: objectId });
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "Carro nao encontrado." });
    }

    return res.json({ ok: true });
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
