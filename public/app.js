const form = document.getElementById("car-form");
const message = document.getElementById("form-message");
const carsBody = document.getElementById("cars-body");
const formTitle = document.getElementById("form-title");
const cancelEditButton = document.getElementById("cancel-edit");
const submitButton = form.querySelector("button[type=\"submit\"]");
const prevButton = document.getElementById("prev-page");
const nextButton = document.getElementById("next-page");
const pageInfo = document.getElementById("page-info");
const pageSize = document.getElementById("page-size");
let editingId = null;
let limit = Number(pageSize.value) || 10;
let offset = 0;
let total = 0;

function setEditMode(car) {
  editingId = car.id;
  formTitle.textContent = "Editar carro";
  submitButton.textContent = "Salvar alteracoes";
  cancelEditButton.hidden = false;

  form.elements.plate.value = car.plate;
  form.elements.model.value = car.model;
  form.elements.brand.value = car.brand;
  form.elements.year.value = car.year;
  form.elements.color.value = car.color;
}

function resetForm() {
  editingId = null;
  formTitle.textContent = "Novo carro";
  submitButton.textContent = "Salvar";
  cancelEditButton.hidden = true;
  form.reset();
}

function renderCars(cars) {
  carsBody.innerHTML = "";

  cars.forEach((car) => {
    const row = document.createElement("tr");

    row.innerHTML = `
      <td>${car.plate}</td>
      <td>${car.model}</td>
      <td>${car.brand}</td>
      <td>${car.year}</td>
      <td>${car.color}</td>
      <td class="action-cell">
        <button data-action="edit" data-id="${car.id}">Editar</button>
        <button data-action="delete" data-id="${car.id}" class="button-secondary">Excluir</button>
      </td>
    `;

    row.querySelector("[data-action=\"edit\"]").addEventListener("click", () => {
      setEditMode(car);
    });

    row.querySelector("[data-action=\"delete\"]").addEventListener("click", async () => {
      await deleteCar(car.id);
    });

    carsBody.appendChild(row);
  });
}

async function fetchCars() {
  const response = await fetch(`/api/cars?limit=${limit}&offset=${offset}`);
  const data = await response.json();
  const cars = Array.isArray(data) ? data : data.items;
  total = Array.isArray(data) ? cars.length : data.total;

  if (total > 0 && offset >= total) {
    offset = Math.max(total - limit, 0);
    return fetchCars();
  }

  renderCars(cars || []);
  updatePager();
}

function updatePager() {
  const totalPages = Math.max(Math.ceil(total / limit), 1);
  const currentPage = Math.min(Math.floor(offset / limit) + 1, totalPages);

  pageInfo.textContent = `Pagina ${currentPage} de ${totalPages}`;
  prevButton.disabled = offset === 0;
  nextButton.disabled = offset + limit >= total;
}

async function createCar(data) {
  const response = await fetch("/api/cars", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(data)
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Erro ao salvar.");
  }

  return response.json();
}

async function updateCar(id, data) {
  const response = await fetch(`/api/cars/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(data)
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Erro ao atualizar.");
  }

  return response.json();
}

async function deleteCar(id) {
  const response = await fetch(`/api/cars/${id}`, {
    method: "DELETE"
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Erro ao excluir.");
  }

  await fetchCars();
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  message.classList.remove("success");

  const formData = new FormData(form);
  const data = {
    plate: formData.get("plate").trim(),
    model: formData.get("model").trim(),
    brand: formData.get("brand").trim(),
    year: Number(formData.get("year")),
    color: formData.get("color").trim()
  };

  try {
    if (editingId) {
      await updateCar(editingId, data);
      message.textContent = "Carro atualizado com sucesso.";
    } else {
      await createCar(data);
      message.textContent = "Carro cadastrado com sucesso.";
    }

    resetForm();
    message.classList.add("success");
    await fetchCars();
  } catch (error) {
    message.textContent = error.message;
    message.classList.remove("success");
  }
});

cancelEditButton.addEventListener("click", () => {
  resetForm();
  message.textContent = "Edicao cancelada.";
  message.classList.remove("success");
});

prevButton.addEventListener("click", async () => {
  offset = Math.max(offset - limit, 0);
  await fetchCars();
});

nextButton.addEventListener("click", async () => {
  offset += limit;
  await fetchCars();
});

pageSize.addEventListener("change", async () => {
  limit = Number(pageSize.value) || 10;
  offset = 0;
  await fetchCars();
});

fetchCars().catch(() => {
  message.textContent = "Nao foi possivel carregar os carros.";
});
