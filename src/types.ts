export type Piece = {
  id: string
  title: string
  text: string
}

export type Voice = {
  id: string
  label: string
  texts: Piece[]
}
