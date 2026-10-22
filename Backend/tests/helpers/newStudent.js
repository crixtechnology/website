const request = require("supertest");

// Creates a student the way the site does: the login form with a new email
// (createAccount + the age box), then Profile saves the name and phone. Returns
// the same { status, body: { ok, token, user } } shape the old /auth/signup gave.
async function newStudent(app, { name = "Student", email, phone = "", password = "a-real-password", referralCode } = {}) {
  const created = await request(app).post("/api/auth/login").send({ email, password, createAccount: true, ageConfirmed: true, referralCode });
  if (created.status !== 201 || !name) return created;
  const saved = await request(app).patch("/api/auth/me").set("Authorization", `Bearer ${created.body.token}`)
    .send({ name, ...(phone ? { phone } : {}), confirmName: true });
  return { status: created.status, body: { ...created.body, user: saved.body.user || created.body.user } };
}

module.exports = { newStudent };
