import { mountBody, mvw } from './mvw.js';

const Hello = ({ self }, { what = 'world' } = {}) => mvw`
  <div>
    <p>Hello, ${what}!</p>
    <p>
      <input type="text" value="${what}" onchange=${({ target }) => {
        self.update({ what: target.value });
      }}/>
    </p>
  </div>
`;

mountBody(Hello);
