import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import UserPicker from "./components/UserPicker.jsx";

global.IS_REACT_ACT_ENVIRONMENT = true;

const USERS = [
  { _id: "1", name: "Asha Patel", email: "asha@example.com", phone: "+91 98765 11111" },
  { _id: "2", name: "Ravi Shah", email: "ravi@college.edu", phone: "" },
  { _id: "3", name: "Meera Iyer", email: "meera@example.com", phone: "9000022222" },
];

let container;
let root;
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const q = (sel) => container.querySelector(sel);
const options = () => Array.from(container.querySelectorAll('[role="option"]'));
const type = (value) => act(() => {
  const el = q('[role="combobox"]');
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
});
const key = (k) => act(() => {
  q('[role="combobox"]').dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
});

function Harness({ onPick }) {
  const [user, setUser] = useState(null);
  return <UserPicker users={USERS} value={user} onChange={(u) => { setUser(u); onPick(u); }} />;
}

describe("UserPicker (admin: choose a student)", () => {
  it("filters by name, email or phone and picks with a click", () => {
    const onPick = jest.fn();
    act(() => root.render(<Harness onPick={onPick} />));

    type("college");
    expect(options().map((o) => o.textContent)).toEqual([expect.stringContaining("Ravi Shah")]);

    type("22222");
    expect(options()).toHaveLength(1);
    act(() => { options()[0].dispatchEvent(new Event("pointerdown", { bubbles: true, cancelable: true })); });
    expect(onPick).toHaveBeenLastCalledWith(USERS[2]);

    // The chosen account replaces the search box, with a way to change it.
    expect(q('[role="combobox"]')).toBeNull();
    expect(container.textContent).toContain("meera@example.com");
    act(() => { q(".user-picker-change").click(); });
    expect(q('[role="combobox"]')).not.toBeNull();
  });

  it("picks with the keyboard and never submits the surrounding form on Enter", () => {
    const onPick = jest.fn();
    const onSubmit = jest.fn((e) => e.preventDefault());
    act(() => root.render(<form onSubmit={onSubmit}><Harness onPick={onPick} /></form>));

    type("example");
    key("ArrowDown");
    key("Enter");
    expect(onPick).toHaveBeenLastCalledWith(USERS[2]);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("doesn't match phone numbers on the digits of a name/email search", () => {
    act(() => root.render(<Harness onPick={() => {}} />));
    type("asha1");
    expect(container.textContent).toContain("No account matches that.");
    type("98765");
    expect(options()).toHaveLength(1);
  });

  it("says so when nothing matches", () => {
    act(() => root.render(<Harness onPick={() => {}} />));
    type("zzz");
    expect(container.textContent).toContain("No account matches that.");
  });
});
