import HomeServices from './HomeServices.jsx'

export default function HomeFeatures() {
  return (
    <section className="hp-sec" id="features">
      <HomeServices>
        <h2 className="hp-svc__title">
          Everything The Counter Does
          <br />
          On <mark>One Screen</mark>
        </h2>
        <p className="hp-svc__sub">
          Ring up the sale, print the receipt, move the stock, credit the points and post the
          profit, from a single tap on a single login.
        </p>
      </HomeServices>
    </section>
  )
}
