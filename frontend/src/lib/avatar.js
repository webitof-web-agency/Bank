import manAvatar from '../../assets/images/manavtar.png';
import womanAvatar from '../../assets/images/womenavtar.png';

const femaleNames = new Set([
  'kavya', 'sneha', 'neha', 'anjali', 'priya', 'pooja', 'shradha', 'shreya',
  'riya', 'aarti', 'aditi', 'akansha', 'alisha', 'amrita', 'ananya', 'anita',
  'anushka', 'aparna', 'asha', 'bhavna', 'bhumika', 'chhaya', 'deepa', 'divya',
  'esha', 'gita', 'hema', 'isha', 'jaya', 'jyoti', 'kajal', 'kamala', 'kavita',
  'khushi', 'kiran', 'komal', 'kriti', 'lakshmi', 'lata', 'madhuri', 'mala',
  'mamta', 'manisha', 'maya', 'meena', 'megha', 'mona', 'mukta', 'namrata',
  'nandini', 'neelam', 'nidhi', 'nikita', 'nisha', 'nita', 'pallavi', 'payal',
  'poonam', 'prachi', 'pragati', 'prerna', 'priyanka', 'puja', 'puneet',
  'racha', 'radha', 'radhika', 'rajni', 'rakhi', 'rani', 'rashmi', 'reena',
  'rekha', 'renu', 'richa', 'riddhi', 'rima', 'roshni', 'ruchi', 'ruchika',
  'rupa', 'sakshi', 'sangeeta', 'sanjana', 'sapna', 'sarah', 'sarita', 'savita',
  'seema', 'shailja', 'shalini', 'shanti', 'shikha', 'shilpa', 'shital',
  'shivani', 'shraddha', 'shruti', 'shweta', 'simran', 'smita', 'smriti',
  'sonal', 'sonali', 'sonia', 'sujata', 'suman', 'sunita', 'supriya', 'surabhi',
  'sushma', 'swati', 'tanya', 'tanuja', 'tara', 'tejal', 'tulsi', 'uma',
  'unnati', 'upriya', 'urvashi', 'urvi', 'usha', 'vandana', 'varsha', 'vidya',
  'vimala', 'vinita', 'yamini', 'yashoda', 'yashika'
]);

// Women in the society's records carry a title ("SMT.", "KU.") or a BAI/DEVI
// name. Many men's names end in -a/-i (RAJENDRA, CHAKRADHARI) or start with
// a name from the list above joined to a male part (TARA CHAND, UMA SHANKAR,
// ASHA RAM), so neither counts as female on its own.
const femaleTitles = new Set(['smt', 'shrimati', 'ku', 'kumari', 'km', 'sushri', 'mrs', 'ms', 'miss']);
const femaleNameParts = new Set(['bai', 'devi']);
const maleNameParts = new Set([
  'ram', 'chand', 'shankar', 'lal', 'prasad', 'kumar', 'singh', 'das', 'nath',
  'narayan', 'vinod', 'dev', 'dutt', 'datt', 'bihari', 'charan', 'sharan', 'raj'
]);

export function getGender(fullName) {
  if (!fullName) return 'unknown';

  const parts = String(fullName).toLowerCase().split(/[\s.]+/).filter(Boolean);
  if (femaleTitles.has(parts[0])) return 'female';
  if (['mr', 'shri', 'sri'].includes(parts[0])) return 'male';
  if (parts.some((part) => femaleNameParts.has(part))) return 'female';

  const given = parts[0] === 'dr' ? parts.slice(1) : parts;
  if (femaleNames.has(given[0]) && !maleNameParts.has(given[1])) return 'female';

  return 'male';
}

export function getDefaultAvatarSrc(name, explicitGender) {
  const gender = explicitGender ? String(explicitGender).toLowerCase() : getGender(name);
  if (gender === 'female') return womanAvatar;
  if (gender === 'male') return manAvatar;
  return manAvatar; // fallback to manAvatar if other/unknown, or you can return null if preferred. Let's return manAvatar as a default.
}
