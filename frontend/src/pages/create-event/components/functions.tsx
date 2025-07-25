function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatNextDate(date: Date): string {
  const nextDate = new Date(date.getTime() + (24 * 60 * 60 * 1000)); // Add one day in milliseconds
  return formatDate(nextDate);
}

export { formatDate, formatNextDate };