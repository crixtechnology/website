// Fetches a same-origin image (from /public) and resolves it to a base64
// data URL so it can be embedded via jsPDF's addImage(). Fails soft —
// returns null instead of throwing, so a missing asset never blocks a PDF.
export default async function loadImageDataUrl(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}
