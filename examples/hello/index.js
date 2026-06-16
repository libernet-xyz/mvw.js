import { bind, mvw } from './mvw';

const Hello = ({ self }, { what } = { what: 'world' }) => mvw`
  <div>
    <p>Hello, ${what}!</p>
    <p>
      <input type="text" value="${what}" onchange=${({ target }) => {
        self.update({ what: target.value });
      }}/>
    </p>
  </div>
`;

bind(document.body, Hello);
