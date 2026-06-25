export function digitsOnlyPhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

export function googleMapsDirectionsUrl(address: string): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address.trim())}`;
}

export function wazeNavigateUrl(address: string): string {
  return `https://waze.com/ul?q=${encodeURIComponent(address.trim())}&navigate=yes`;
}

export function whatsAppContactUrl(phone: string, message: string): string {
  return `https://wa.me/${digitsOnlyPhone(phone)}?text=${encodeURIComponent(message)}`;
}
