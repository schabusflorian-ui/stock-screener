import { renderHook, act, waitFor } from '@testing-library/react';
import { useApi, useLazyApi, useMutation } from './useApi';

describe('useApi', () => {
  test('fetches data on mount', async () => {
    const mockApi = jest.fn().mockResolvedValue({ data: { id: 1 } });

    const { result } = renderHook(() => useApi(mockApi));

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toEqual({ id: 1 });
    expect(result.current.error).toBeNull();
    expect(mockApi).toHaveBeenCalledTimes(1);
  });

  test('does not fetch when enabled is false', async () => {
    const mockApi = jest.fn().mockResolvedValue({ data: { id: 1 } });

    const { result } = renderHook(() => useApi(mockApi, { enabled: false }));

    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBeNull();
    expect(mockApi).not.toHaveBeenCalled();
  });

  test('handles errors', async () => {
    const mockApi = jest.fn().mockRejectedValue(new Error('API Error'));

    const { result } = renderHook(() => useApi(mockApi));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe('API Error');
    expect(result.current.data).toBeNull();
  });

  test('calls onSuccess callback', async () => {
    const mockApi = jest.fn().mockResolvedValue({ data: { id: 1 } });
    const onSuccess = jest.fn();

    renderHook(() => useApi(mockApi, { onSuccess }));

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith({ id: 1 });
    });
  });

  test('calls onError callback', async () => {
    const mockApi = jest.fn().mockRejectedValue(new Error('API Error'));
    const onError = jest.fn();

    renderHook(() => useApi(mockApi, { onError }));

    await waitFor(() => {
      expect(onError).toHaveBeenCalled();
    });
  });

  test('refetch forces new API call', async () => {
    const mockApi = jest.fn().mockResolvedValue({ data: { id: 1 } });

    const { result } = renderHook(() => useApi(mockApi));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockApi).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.refetch();
    });

    await waitFor(() => {
      expect(mockApi).toHaveBeenCalledTimes(2);
    });
  });

  test('uses initial data', () => {
    const mockApi = jest.fn().mockResolvedValue({ data: { id: 2 } });

    const { result } = renderHook(() =>
      useApi(mockApi, { initialData: { id: 1 } })
    );

    expect(result.current.data).toEqual({ id: 1 });
  });
});

describe('useLazyApi', () => {
  test('does not fetch on mount', () => {
    const mockApi = jest.fn().mockResolvedValue({ data: { id: 1 } });

    const { result } = renderHook(() => useLazyApi(mockApi));

    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBeNull();
    expect(mockApi).not.toHaveBeenCalled();
  });

  test('fetches when fetch is called', async () => {
    const mockApi = jest.fn().mockResolvedValue({ data: { id: 1 } });

    const { result } = renderHook(() => useLazyApi(mockApi));

    await act(async () => {
      await result.current.fetch();
    });

    expect(result.current.data).toEqual({ id: 1 });
    expect(mockApi).toHaveBeenCalledTimes(1);
  });

  test('passes arguments to API function', async () => {
    const mockApi = jest.fn().mockResolvedValue({ data: { id: 1 } });

    const { result } = renderHook(() => useLazyApi(mockApi));

    await act(async () => {
      await result.current.fetch('arg1', 'arg2');
    });

    expect(mockApi).toHaveBeenCalledWith('arg1', 'arg2');
  });

  test('reset clears state', async () => {
    const mockApi = jest.fn().mockResolvedValue({ data: { id: 1 } });

    const { result } = renderHook(() => useLazyApi(mockApi));

    await act(async () => {
      await result.current.fetch();
    });

    expect(result.current.data).toEqual({ id: 1 });

    act(() => {
      result.current.reset();
    });

    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });
});

describe('useMutation', () => {
  test('does not execute on mount', () => {
    const mockMutation = jest.fn().mockResolvedValue({ data: { id: 1 } });

    const { result } = renderHook(() => useMutation(mockMutation));

    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBeNull();
    expect(mockMutation).not.toHaveBeenCalled();
  });

  test('executes mutation when mutate is called', async () => {
    const mockMutation = jest.fn().mockResolvedValue({ data: { success: true } });

    const { result } = renderHook(() => useMutation(mockMutation));

    await act(async () => {
      await result.current.mutate({ name: 'test' });
    });

    expect(result.current.data).toEqual({ success: true });
    expect(mockMutation).toHaveBeenCalledWith({ name: 'test' });
  });

  test('calls onSuccess after mutation', async () => {
    const mockMutation = jest.fn().mockResolvedValue({ data: { id: 1 } });
    const onSuccess = jest.fn();

    const { result } = renderHook(() =>
      useMutation(mockMutation, { onSuccess })
    );

    await act(async () => {
      await result.current.mutate();
    });

    expect(onSuccess).toHaveBeenCalledWith({ id: 1 });
  });

  test('handles mutation errors', async () => {
    const mockMutation = jest.fn().mockRejectedValue(new Error('Mutation Error'));

    const { result } = renderHook(() => useMutation(mockMutation));

    await act(async () => {
      try {
        await result.current.mutate();
      } catch (e) {
        // Expected error
      }
    });

    expect(result.current.error).toBe('Mutation Error');
  });

  test('reset clears mutation state', async () => {
    const mockMutation = jest.fn().mockResolvedValue({ data: { id: 1 } });

    const { result } = renderHook(() => useMutation(mockMutation));

    await act(async () => {
      await result.current.mutate();
    });

    expect(result.current.data).toEqual({ id: 1 });

    act(() => {
      result.current.reset();
    });

    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });
});
