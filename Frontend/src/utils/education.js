// The education details in a student's profile (college, course, branch /
// department, semester, year of passing). Optional in Profile, but a free
// internship (pages/FreeInternships.jsx) needs all of them — the server checks
// the same list (Backend/src/utils/accounts.js educationMissing).

export const SEMESTERS = [
  ...Array.from({ length: 10 }, (_, i) => [String(i + 1), `Semester ${i + 1}`]),
  ["graduated", "Graduated"],
];

export const semesterLabel = (value) => (SEMESTERS.find(([v]) => v === value) || [, ""])[1];

export const emptyEducation = { college: "", course: "", department: "", semester: "", passingYear: "" };

// The user's saved education as form values (the year as text, for the input).
export const educationForm = (user) => {
  const e = (user && user.education) || {};
  return {
    college: e.college || "",
    course: e.course || "",
    department: e.department || "",
    semester: e.semester || "",
    passingYear: e.passingYear ? String(e.passingYear) : "",
  };
};

// The form values as PATCH /auth/me expects them.
export const educationPayload = (form) => ({
  college: form.college.trim(),
  course: form.course.trim(),
  department: form.department.trim(),
  semester: form.semester,
  passingYear: form.passingYear.trim() ? Number(form.passingYear) : null,
});

// What's still empty, by name; [] = complete.
export function educationMissing(form) {
  const missing = [];
  if (!form.college.trim()) missing.push("college name");
  if (!form.course.trim()) missing.push("course");
  if (!form.department.trim()) missing.push("branch / department");
  if (!form.semester) missing.push("semester");
  if (!/^\d{4}$/.test(form.passingYear.trim())) missing.push("year of passing");
  return missing;
}

/* The five inputs, shared by Profile and the free-internship apply form.
   `idPrefix` keeps the label/input ids unique on a page. */
export function EducationFields({ form, onChange, disabled = false, idPrefix = "edu" }) {
  const set = (key) => (e) => onChange({ ...form, [key]: e.target.value });
  const id = (key) => `${idPrefix}-${key}`;
  return (
    <>
      <div className="field">
        <label htmlFor={id("college")}>College / university name</label>
        <input id={id("college")} maxLength={150} value={form.college} onChange={set("college")} disabled={disabled} placeholder="e.g. Gujarat University" autoComplete="organization" />
      </div>
      <div className="field">
        <label htmlFor={id("course")}>Course</label>
        <input id={id("course")} maxLength={100} value={form.course} onChange={set("course")} disabled={disabled} placeholder="e.g. B.Tech, BCA, B.Com, BBA, B.Sc" />
      </div>
      <div className="field">
        <label htmlFor={id("department")}>Branch / department</label>
        <input id={id("department")} maxLength={100} value={form.department} onChange={set("department")} disabled={disabled} placeholder="e.g. Computer Engineering, Commerce" />
      </div>
      <div className="field">
        <label htmlFor={id("semester")}>Semester</label>
        <select id={id("semester")} value={form.semester} onChange={set("semester")} disabled={disabled}>
          <option value="">Choose…</option>
          {SEMESTERS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor={id("year")}>Year of passing {form.semester === "graduated" ? "" : "(expected)"}</label>
        <input id={id("year")} inputMode="numeric" maxLength={4} value={form.passingYear}
          onChange={(e) => onChange({ ...form, passingYear: e.target.value.replace(/\D/g, "").slice(0, 4) })}
          disabled={disabled} placeholder="e.g. 2027" />
      </div>
    </>
  );
}
