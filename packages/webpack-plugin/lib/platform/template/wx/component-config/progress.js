const TAG_NAME = 'progress'

module.exports = function ({ print }) {
  const aliPropLog = print({ platform: 'ali', tag: TAG_NAME, isError: false })
  const aliEventLog = print({ platform: 'ali', tag: TAG_NAME, isError: false, type: 'event' })
  return {
    test: TAG_NAME,
    props: [
      {
        test: /^(border-radius|font-size|color|active-mode)$/,
        ali: aliPropLog
      },
      {
        test: /^(activeColor|backgroundColor)$/,
        ali (obj) {
          const propsMap = {
            'activeColor': 'active-color',
            'backgroundColor': 'background-color'
          }
          obj.name = propsMap[obj.name]
          return obj
        }
      }
    ],
    event: [
      {
        test: /^(activeend)$/,
        ali: aliEventLog
      }
    ]
  }
}
