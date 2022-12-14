import type { OptionList, OptionWeightsTuple, PoolItem, WeightsFnItem } from './types';

/**
 * 维护一个选项池
 */
export class OptionsPool<T> {
  /**
   * 选项池
   * @protected
   */
  protected pool: PoolItem<T>[] = [];

  constructor(options: OptionList<T>) {
    this.generatePool(options);
  }

  /**
   * 计算权重
   * @protected
   */
  protected computeWeights(list: OptionList<T>): [number, number] {
    // 静态权重累计
    const [staticWeights, fnList] = list.reduce(
      ([weightTotal, fnList], cur) => {
        if (typeof cur.weights === 'number') {
          return [weightTotal + cur.weights, fnList];
        }
        fnList.push(cur as WeightsFnItem<T>);
        return [weightTotal, fnList];
      },
      [0, [] as WeightsFnItem<T>[]],
    );
    // WeightFn如果返回的是百分比，那么这个百分比是相对于固定weight的累积百分比，
    // 也就是说动态百分比是相对于静态百分比的
    return [
      fnList.reduce((prev, cur) => {
        return prev + cur.weights(staticWeights);
      }, staticWeights) || 1, // 总权重不能为0，当只有一个选项，且选项为动态权重的时候会有这种情况
      staticWeights || 1, // 静态权重不能为0
    ];
  }

  /**
   * 生成选项池
   * 计算各个选项的所占的百分比及所处位置，并生成选项池
   * @protected
   */
  protected generatePool(list: OptionList<T>): void {
    // 计算权重
    const [weightsTotal, staticWeightsTotal] = this.computeWeights(list);

    // 生成选项池
    let reduceWeight = 0;
    this.pool = list.map((item) => {
      const weights =
        typeof item.weights === 'number' ? item.weights : item.weights(staticWeightsTotal);
      // 权重为0或负数的强制抛出异常
      if (weights <= 0) {
        throw new RangeError(`权重不能小于等于0，weights: ${weights}`);
      }
      reduceWeight += weights;
      const range = ~~((reduceWeight / weightsTotal) * 1_000_000) / 10_000;
      return { ...item, range };
    });
  }

  /**
   * 从选项池中获取随机选项下标
   */
  private get randomOptionIndex(): number {
    if (!this.pool.length) return -1;
    const range = Math.random() * 100;
    return this.pool.findIndex((item) => item.range > range);
  }

  /**
   * 从选项池中获取随机选项
   */
  get randomOption(): T | null {
    return this.pool[this.randomOptionIndex]?.option || null;
  }

  /**
   * 从选项池中移除相同所有选项，需要根据选项重新计算所有选项的选中几率
   */
  remove(option: T): void {
    const list = this.pool.filter((it) => it.option !== option);
    if (list.length === this.pool.length) return;
    this.generatePool(list);
  }

  /**
   * 拿走某个选项，如果有相同的也只会拿走第一个
   */
  take(): T | null {
    const index = this.randomOptionIndex;
    if (index === -1) return null;
    const option = this.pool.splice(index, 1)[0] as PoolItem<T>;
    this.generatePool(this.pool);
    return option.option;
  }

  /**
   * 选项池剩余选项数量
   */
  get len(): number {
    return this.pool.length;
  }

  /**
   * 选项池剩余的选项
   */
  get allOptions(): T[] {
    return this.pool.map((item) => item.option);
  }

  /**
   * 计算单个选项所占几率
   */
  private calcRateOf(index: number): number {
    const pool = this.pool;
    const w = 10_000;
    const currentRange = ~~((pool[index] as PoolItem<T>).range * w);
    const prevRange = ~~((pool[index - 1]?.range ?? 0) * w);
    return currentRange - prevRange;
  }

  /**
   * 获取选项选中的几率，重复选项会累加起来
   *
   * @example
   *
   * ```ts
   * const picker = new RandomPicker([1, 1, 1]);
   *
   * console.log(picker.rateOf(1)); // 100;
   * ```
   *
   * @param  option 选项
   * @return @return 几率：100分满值
   */
  rateOf(option: T): number {
    const pool = this.pool;
    const indexes = pool.reduce((res, it, currentIndex) => {
      if (it.option === option) res.push(currentIndex);
      return res;
    }, [] as number[]);
    if (!indexes.length) return 0;
    return indexes.reduce((p, i) => p + this.calcRateOf(i), 0) / 10_000;
  }

  /**
   * 导出选项池剩余的选项
   * @return 由option、weights组成的元组所组成的选项数组，可以用于new RandomPicker(picker.export())
   */
  export(): OptionWeightsTuple<T>[] {
    return this.pool.map((item) => [item.option, item.weights]);
  }
}
