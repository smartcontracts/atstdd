import { request, gql } from 'graphql-request'

const generator = async (config) => {
  const query = (skip, first) => {
    return request(
      'https://api.thegraph.com/subgraphs/name/poap-xyz/poap-xdai',
      gql`
        query Event($eventId: ID!, $first: Int, $skip: Int) {
          event(id: $eventId) {
            id
            tokenCount
            created
            tokens(first: $first, skip: $skip) {
              id
              transferCount
              created
              owner {
                id
              }
            }
          }
        }
      `,
      {
        eventId: config.eventId,
        first,
        skip,
      }
    )
  }

  // Grab the base event with one token.
  const results = await query(0, 1)

  // Grab the rest of the tokens.
  results.event.tokens = []
  for (let i = 0; i < results.event.tokenCount; i += 100) {
    const result = await query(i, 100)
    results.event.tokens = [...results.event.tokens, ...result.event.tokens]
  }

  // Map into the format expected by the generator.
  return [
    ...results.event.tokens.map((token) => {
      return {
        schema: '0xb63cb2363b68bc425b3595ed490d4d6d8ccc2568998196458af1ed7c9c7890b3',
        recipient: token.owner.id,
        data: {
          eventID: results.event.id,
          tokenID: token.id,
          created: parseInt(token.created, 10),
        }
      }
    }),
    {
      schema: '0x720beb94bc384589f72cd28edb027b1863698825847d1a73f4219f5a1154cf36',
      recipient: null,
      data: {
        eventID: results.event.id,
        created: parseInt(results.event.created, 10),
      }
    }
  ]
}

export default generator
