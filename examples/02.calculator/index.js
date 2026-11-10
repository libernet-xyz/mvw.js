import { mountBody, mvw } from './mvw.js';

const Display = ({ lhs, op, rhs }) => mvw`
  <p>
    <b>${lhs}</b>
    ${op ? mvw`<b>${op}</b>` : ''}
    ${op && rhs ? mvw`<b>${rhs}</b>` : ''}
  </p>
`;

const Button = ({ label, onClick }) =>
  mvw`<button onclick=${() => {
    onClick();
  }}>${label}</button>`;

const Keyboard = ({ onDigit, onDecimal, onOp, onEnter }) => mvw`
  <div>
    <div>
      ${Button({ label: '7', onClick: () => onDigit(7) })}
      ${Button({ label: '8', onClick: () => onDigit(8) })}
      ${Button({ label: '9', onClick: () => onDigit(9) })}
      ${Button({ label: '+', onClick: () => onOp('+') })}
    </div>
    <div>
      ${Button({ label: '4', onClick: () => onDigit(4) })}
      ${Button({ label: '5', onClick: () => onDigit(5) })}
      ${Button({ label: '6', onClick: () => onDigit(6) })}
      ${Button({ label: '-', onClick: () => onOp('-') })}
    </div>
    <div>
      ${Button({ label: '1', onClick: () => onDigit(1) })}
      ${Button({ label: '2', onClick: () => onDigit(2) })}
      ${Button({ label: '3', onClick: () => onDigit(3) })}
      ${Button({ label: '*', onClick: () => onOp('*') })}
    </div>
    <div>
      ${Button({ label: '0', onClick: () => onDigit(0) })}
      ${Button({ label: '.', onClick: () => onDecimal() })}
      ${Button({ label: '=', onClick: () => onEnter() })}
      ${Button({ label: '/', onClick: () => onOp('/') })}
    </div>
  </div>
`;

const App = ({ self }, { lhs = 0, op = null, rhs = null, decimal = 0 } = {}) => {
  const solve = () => {
    switch (op) {
      case '+':
        return lhs + (rhs ?? 0);
      case '-':
        return lhs - (rhs ?? 0);
      case '*':
        return lhs * (rhs ?? 0);
      case '/':
        return lhs / (rhs ?? 0);
    }
  };
  return mvw`
    <div>
      ${Display({ lhs, op, rhs })}
      ${Keyboard({
        onDigit: digit => {
          if (decimal > 0) {
            const power = 10 ** decimal;
            if (op) {
              self.update({
                rhs: (rhs * power + digit) / power,
                decimal: decimal + 1,
              });
            } else {
              self.update({
                lhs: (lhs * power + digit) / power,
                decimal: decimal + 1,
              });
            }
          } else {
            if (op) {
              self.update({ rhs: rhs * 10 + digit });
            } else {
              self.update({ lhs: lhs * 10 + digit });
            }
          }
        },
        onDecimal: () => {
          if (!decimal) {
            self.update({ decimal: decimal + 1 });
          }
        },
        onOp: op2 => {
          if (op) {
            self.update({
              lhs: solve(),
              op: op2,
              rhs: null,
              decimal: 0,
            });
          } else {
            self.update({
              op: op2,
              decimal: 0,
            });
          }
        },
        onEnter: () => {
          if (op) {
            self.update({
              lhs: solve(),
              op: null,
              rhs: null,
              decimal: 0,
            });
          }
        },
      })}
    </div>
  `;
};

mountBody(App);
