import React from 'react';

const Skeleton = ({ className = '', width = '100%', height = '20px' }) => {
  return (
    <div 
      className={`animate-pulse bg-gray-200 rounded ${className}`}
      style={{ width, height }}
    />
  );
};

export default Skeleton;