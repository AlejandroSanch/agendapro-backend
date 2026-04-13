import { ApiError } from '../utils/ApiError';

describe('ApiError Custom Utility', () => {
  it('debería almacenar el Status apropiadamente', () => {
    const error = new ApiError(404, 'Recurso no encontrado');

    expect(error.statusCode).toBe(404);
    expect(error.message).toBe('Recurso no encontrado');
    expect(error.name).toBe('ApiError');
  });

  it('debería instanciar propertys extendidas (details) cuando es dado', () => {
    const error = new ApiError(400, 'Error de Validación', { minLength: 5 });

    expect(error.statusCode).toBe(400);
    expect(error.message).toBe('Error de Validación');
    expect(error.details).toEqual({ minLength: 5 });
  });

  it('debería heredar nativamente de Error de JS', () => {
    const error = new ApiError(500, 'Server Crashed');
    
    expect(error instanceof Error).toBe(true);
  });
});
