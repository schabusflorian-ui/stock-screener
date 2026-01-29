// frontend/src/components/icons/icons/PieChart.jsx
import React from 'react';
import Icon from '../Icon';

const PieChart = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Fill layer - pie segment */}
    <path
      d="M21.21 15.89C20.5738 17.3945 19.5788 18.7202 18.3119 19.7513C17.0449 20.7824 15.5447 21.4874 13.9424 21.8048C12.3401 22.1222 10.6844 22.0421 9.12012 21.5718C7.55585 21.1014 6.13060 20.2551 4.96448 19.1067C3.79837 17.9583 2.93074 16.5463 2.43676 14.9897C1.94278 13.4331 1.83723 11.7793 2.12916 10.1727C2.42109 8.56614 3.10197 7.05539 4.11248 5.77272C5.12299 4.49005 6.43228 3.47589 7.92 2.82"
      fill="currentColor"
      fillOpacity="0.3"
    />
    {/* Stroke layer */}
    <path
      d="M21.21 15.89C20.5738 17.3945 19.5788 18.7202 18.3119 19.7513C17.0449 20.7824 15.5447 21.4874 13.9424 21.8048C12.3401 22.1222 10.6844 22.0421 9.12012 21.5718C7.55585 21.1014 6.13060 20.2551 4.96448 19.1067C3.79837 17.9583 2.93074 16.5463 2.43676 14.9897C1.94278 13.4331 1.83723 11.7793 2.12916 10.1727C2.42109 8.56614 3.10197 7.05539 4.11248 5.77272C5.12299 4.49005 6.43228 3.47589 7.92 2.82"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M22 12C22 10.6868 21.7413 9.38642 21.2388 8.17317C20.7362 6.95991 19.9997 5.85752 19.0711 4.92893C18.1425 4.00035 17.0401 3.26375 15.8268 2.7612C14.6136 2.25866 13.3132 2 12 2V12H22Z"
      fill="currentColor"
      fillOpacity="0.3"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Icon>
));

PieChart.displayName = 'PieChart';
export default PieChart;
