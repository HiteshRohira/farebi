export type Celebrity = {
  name: string
  category: string
  wikipediaTitle: string
}

// A small, intentionally mainstream starter shelf. Search remains predictable,
// and a custom entry is always available when the room wants someone else.
export const CELEBRITIES: Array<Celebrity> = [
  { name: 'A. R. Rahman', category: 'Music', wikipediaTitle: 'A. R. Rahman' },
  { name: 'Aamir Khan', category: 'Actor', wikipediaTitle: 'Aamir Khan' },
  {
    name: 'Aishwarya Rai Bachchan',
    category: 'Actor',
    wikipediaTitle: 'Aishwarya Rai Bachchan',
  },
  { name: 'Akshay Kumar', category: 'Actor', wikipediaTitle: 'Akshay Kumar' },
  { name: 'Alia Bhatt', category: 'Actor', wikipediaTitle: 'Alia Bhatt' },
  { name: 'Allu Arjun', category: 'Actor', wikipediaTitle: 'Allu Arjun' },
  {
    name: 'Amitabh Bachchan',
    category: 'Actor',
    wikipediaTitle: 'Amitabh Bachchan',
  },
  { name: 'Arijit Singh', category: 'Music', wikipediaTitle: 'Arijit Singh' },
  {
    name: 'B. R. Ambedkar',
    category: 'Public figure',
    wikipediaTitle: 'B. R. Ambedkar',
  },
  {
    name: 'Deepika Padukone',
    category: 'Actor',
    wikipediaTitle: 'Deepika Padukone',
  },
  {
    name: 'Diljit Dosanjh',
    category: 'Music & film',
    wikipediaTitle: 'Diljit Dosanjh',
  },
  {
    name: 'Droupadi Murmu',
    category: 'Politics',
    wikipediaTitle: 'Droupadi Murmu',
  },
  {
    name: 'Gautam Adani',
    category: 'Business',
    wikipediaTitle: 'Gautam Adani',
  },
  {
    name: 'Hardik Pandya',
    category: 'Cricket',
    wikipediaTitle: 'Hardik Pandya',
  },
  {
    name: 'Hrithik Roshan',
    category: 'Actor',
    wikipediaTitle: 'Hrithik Roshan',
  },
  {
    name: 'Indira Gandhi',
    category: 'Politics',
    wikipediaTitle: 'Indira Gandhi',
  },
  {
    name: 'Kapil Sharma',
    category: 'Comedy',
    wikipediaTitle: 'Kapil Sharma (comedian)',
  },
  { name: 'Karan Johar', category: 'Director', wikipediaTitle: 'Karan Johar' },
  {
    name: 'Kareena Kapoor Khan',
    category: 'Actor',
    wikipediaTitle: 'Kareena Kapoor Khan',
  },
  { name: 'Kiara Advani', category: 'Actor', wikipediaTitle: 'Kiara Advani' },
  {
    name: 'Lata Mangeshkar',
    category: 'Music',
    wikipediaTitle: 'Lata Mangeshkar',
  },
  { name: 'M. S. Dhoni', category: 'Cricket', wikipediaTitle: 'MS Dhoni' },
  {
    name: 'Mamata Banerjee',
    category: 'Politics',
    wikipediaTitle: 'Mamata Banerjee',
  },
  {
    name: 'Manmohan Singh',
    category: 'Politics',
    wikipediaTitle: 'Manmohan Singh',
  },
  { name: 'Mary Kom', category: 'Sport', wikipediaTitle: 'Mary Kom' },
  { name: 'Mithali Raj', category: 'Cricket', wikipediaTitle: 'Mithali Raj' },
  {
    name: 'Mukesh Ambani',
    category: 'Business',
    wikipediaTitle: 'Mukesh Ambani',
  },
  {
    name: 'Narendra Modi',
    category: 'Politics',
    wikipediaTitle: 'Narendra Modi',
  },
  { name: 'Neeraj Chopra', category: 'Sport', wikipediaTitle: 'Neeraj Chopra' },
  {
    name: 'Nita Ambani',
    category: 'Business & sport',
    wikipediaTitle: 'Nita Ambani',
  },
  { name: 'P. V. Sindhu', category: 'Sport', wikipediaTitle: 'P. V. Sindhu' },
  {
    name: 'Pankaj Tripathi',
    category: 'Actor',
    wikipediaTitle: 'Pankaj Tripathi',
  },
  {
    name: 'Priyanka Chopra Jonas',
    category: 'Actor',
    wikipediaTitle: 'Priyanka Chopra',
  },
  { name: 'Rajinikanth', category: 'Actor', wikipediaTitle: 'Rajinikanth' },
  { name: 'Ratan Tata', category: 'Business', wikipediaTitle: 'Ratan Tata' },
  { name: 'Rekha', category: 'Actor', wikipediaTitle: 'Rekha' },
  { name: 'Rohit Sharma', category: 'Cricket', wikipediaTitle: 'Rohit Sharma' },
  {
    name: 'Sachin Tendulkar',
    category: 'Cricket',
    wikipediaTitle: 'Sachin Tendulkar',
  },
  { name: 'Salman Khan', category: 'Actor', wikipediaTitle: 'Salman Khan' },
  {
    name: 'Sanjay Leela Bhansali',
    category: 'Director',
    wikipediaTitle: 'Sanjay Leela Bhansali',
  },
  {
    name: 'Shah Rukh Khan',
    category: 'Actor',
    wikipediaTitle: 'Shah Rukh Khan',
  },
  {
    name: 'Shreya Ghoshal',
    category: 'Music',
    wikipediaTitle: 'Shreya Ghoshal',
  },
  {
    name: 'Smriti Irani',
    category: 'Politics',
    wikipediaTitle: 'Smriti Irani',
  },
  { name: 'Sridevi', category: 'Actor', wikipediaTitle: 'Sridevi' },
  {
    name: 'S. S. Rajamouli',
    category: 'Director',
    wikipediaTitle: 'S. S. Rajamouli',
  },
  {
    name: 'Sunil Chhetri',
    category: 'Football',
    wikipediaTitle: 'Sunil Chhetri',
  },
  { name: 'Taapsee Pannu', category: 'Actor', wikipediaTitle: 'Taapsee Pannu' },
  { name: 'Virat Kohli', category: 'Cricket', wikipediaTitle: 'Virat Kohli' },
  {
    name: 'Yogi Adityanath',
    category: 'Politics',
    wikipediaTitle: 'Yogi Adityanath',
  },
  {
    name: 'Zakir Khan',
    category: 'Comedy',
    wikipediaTitle: 'Zakir Khan (comedian)',
  },
]

export async function resolveCelebrityPhoto(wikipediaTitle: string) {
  const parameters = new URLSearchParams({
    action: 'query',
    origin: '*',
    format: 'json',
    formatversion: '2',
    prop: 'pageimages',
    piprop: 'thumbnail|original',
    pithumbsize: '900',
    titles: wikipediaTitle,
  })
  const response = await fetch(
    `https://en.wikipedia.org/w/api.php?${parameters}`,
  )
  if (!response.ok) return undefined
  const result = (await response.json()) as {
    query?: {
      pages?: Array<{
        original?: { source?: string }
        thumbnail?: { source?: string }
      }>
    }
  }
  const page = result.query?.pages?.[0]
  return page?.thumbnail?.source ?? page?.original?.source
}
