import { openRazorpayCheckout, paymentFailedText, CHECKOUT_TIMEOUT_S } from "./components/ui.jsx";

// Every payment opens Razorpay Checkout through openRazorpayCheckout, which has
// to end the checkout on its own when a payment fails or never reports back —
// otherwise the buyer is left on a spinner and the page never resets.

let instance;
beforeEach(() => {
  instance = null;
  window.Razorpay = jest.fn(function Razorpay(options) {
    instance = this;
    this.options = options;
    this.events = {};
    this.on = (name, fn) => { this.events[name] = fn; };
    this.open = jest.fn();
    // Razorpay calls ondismiss when Checkout is closed, whoever closes it.
    this.close = jest.fn(() => options.modal.ondismiss());
  });
});

const open = (onClose, handler = jest.fn()) => openRazorpayCheckout({ key: "rzp_test_x", order_id: "order_1", handler }, onClose);

it("closes Checkout and reports the reason when a payment fails", () => {
  const onClose = jest.fn();
  open(onClose);
  instance.events["payment.failed"]({ error: { description: "Payment was cancelled by the user." } });
  expect(instance.close).toHaveBeenCalled();
  expect(onClose).toHaveBeenCalledTimes(1); // not again as a plain "closed" from ondismiss
  expect(onClose).toHaveBeenCalledWith({ reason: "Payment was cancelled by the user." });
  expect(paymentFailedText(onClose.mock.calls[0][0])).toContain("(Payment was cancelled by the user)");
});

it("turns off Razorpay's retry screen and sets a timeout", () => {
  open(jest.fn());
  expect(instance.options.retry).toEqual({ enabled: false });
  expect(instance.options.timeout).toBe(CHECKOUT_TIMEOUT_S);
  expect(instance.open).toHaveBeenCalled();
});

it("reports a plain close as no failure", () => {
  const onClose = jest.fn();
  open(onClose);
  instance.options.modal.ondismiss();
  expect(onClose).toHaveBeenCalledWith(null);
});

it("closes a checkout that never reports back", () => {
  jest.useFakeTimers();
  try {
    const onClose = jest.fn();
    open(onClose);
    jest.advanceTimersByTime((CHECKOUT_TIMEOUT_S + 5) * 1000);
    expect(instance.close).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledWith({ timedOut: true });
  } finally {
    jest.useRealTimers();
  }
});

it("leaves a successful payment to its handler", () => {
  jest.useFakeTimers();
  try {
    const onClose = jest.fn();
    const handler = jest.fn();
    open(onClose, handler);
    instance.options.handler({ razorpay_payment_id: "pay_1" });
    jest.advanceTimersByTime((CHECKOUT_TIMEOUT_S + 5) * 1000);
    expect(handler).toHaveBeenCalledWith({ razorpay_payment_id: "pay_1" });
    expect(onClose).not.toHaveBeenCalled();
    expect(instance.close).not.toHaveBeenCalled();
  } finally {
    jest.useRealTimers();
  }
});
