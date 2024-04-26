import { RuleData } from "./prompt";
import { fetchRulePage } from "./rule";

export const exampleRuleName = '児童育成手当'
export const exampleRuleURL = 'https://www.city.shibuya.tokyo.jp/kodomo/teate/hitorioya/hitorioya_teate.html'

/*
  This source code is from https://github.com/project-inclusive/OpenFisca-Japan
  GNU AFFERO GENERAL PUBLIC LICENSE Version 3, 19 November 2007
*/
export const exampleSrc = `
class 児童育成手当(Variable):
    value_type = float
    entity = 世帯
    definition_period = DAY
    label = "保護者への児童手当"
    reference = "https://www.city.shibuya.tokyo.jp/kodomo/teate/hitorioya/hitorioya_teate.html"
    documentation = """
    渋谷区の児童育成手当制度

    - 〒150-8010 東京都渋谷区宇田川町1-1
    - 渋谷区子ども青少年課子育て給付係
    - 03-3463-2558
    """

    def formula(対象世帯, 対象期間, parameters):
        居住都道府県 = 対象世帯("居住都道府県", 対象期間)
        居住地条件 = 居住都道府県 == "東京都"

        児童育成手当 = parameters(対象期間).福祉.育児.児童育成手当

        # 世帯で最も高い所得の人が基準となる。特別児童扶養手当と同等の控除が適用される。
        # （参考）https://www.city.adachi.tokyo.jp/oyako/k-kyoiku/kosodate/hitorioya-ikuse.html
        世帯高所得 = 対象世帯("特別児童扶養手当の控除後世帯高所得", 対象期間)
        扶養人数 = 対象世帯("扶養人数", 対象期間)

        # NOTE: 直接 \`所得制限限度額[扶養人数]\` のように要素参照すると型が合わず複数世帯の場合に計算できないためnp.selectを使用
        所得制限限度額 = np.select(
            [扶養人数 == i for i in range(6)],
            [児童育成手当.所得制限限度額[i] for i in range(6)],
            -1).astype(int)

        所得条件 = 世帯高所得 < 所得制限限度額

        ひとり親世帯である = 対象世帯("ひとり親", 対象期間)
        学年 = 対象世帯.members("学年", 対象期間)
        上限学年以下の人数 = 対象世帯.sum(学年 <= 児童育成手当.上限学年)
        手当条件 = ひとり親世帯である * 所得条件 * 居住地条件

        return 手当条件 * 上限学年以下の人数 * 児童育成手当.金額
`

export async function getExampleData(): Promise<RuleData> {
  const name = '児童育成手当'
  const url = 'https://www.city.shibuya.tokyo.jp/kodomo/kodomo-teate-josei/hitorioya/hitorioya_teate.html'

  const content = await fetchRulePage(url)
  console.log(content)

  if (content === undefined) {
    throw `content from "${url}" was empty`
  }

  return { name, content }
}


// TODO: OpenFiscaのリポジトリから自動生成、自動更新できるようにする
/*
  This source code is from https://github.com/project-inclusive/OpenFisca-Japan
  GNU AFFERO GENERAL PUBLIC LICENSE Version 3, 19 November 2007
*/
export const instruction = `
あなたはOpenFiscaに新たな制度を追加しようとしているプログラマーです。過去実装されているすべての制度に精通しており、その関係性にもとづき注意深く新制度の処理を追加することができます。以下は過去実装された制度のソースコードです。

\`\`\`python
"""
This file defines variables for the modelled legislation.

A variable is a property of an Entity such as a 人物, a 世帯…

See https://openfisca.org/doc/key-concepts/variables.html
"""

from functools import cache

import numpy as np
# Import from openfisca-core the Python objects used to code the legislation in OpenFisca
from openfisca_core.holders import set_input_divide_by_period
from openfisca_core.periods import DAY, period
from openfisca_core.variables import Variable
# Import the Entities specifically defined for this tax and benefit system
from openfisca_japan.entities import 世帯, 人物
from openfisca_japan.variables.障害.愛の手帳 import 愛の手帳等級パターン
from openfisca_japan.variables.障害.療育手帳 import 療育手帳等級パターン
from openfisca_japan.variables.障害.精神障害者保健福祉手帳 import 精神障害者保健福祉手帳等級パターン
from openfisca_japan.variables.障害.身体障害者手帳 import 身体障害者手帳等級パターン


# NOTE: 項目数が多い金額表は可読性の高いCSV形式としている。


@cache
def 配偶者控除額表():
    """
    csvファイルから値を読み込み

    配偶者控除額表()[配偶者の所得区分, 納税者本人の所得区分] の形で参照可能
    """
    return np.genfromtxt("openfisca_japan/assets/所得/配偶者控除額.csv",
                  delimiter=",", skip_header=1, dtype="int64")[np.newaxis, 1:]


@cache
def 配偶者特別控除額表():
    """
    csvファイルから値を読み込み

    配偶者特別控除額表()[配偶者の所得区分, 納税者本人の所得区分] の形で参照可能
    """
    return np.genfromtxt("openfisca_japan/assets/所得/配偶者特別控除額.csv",
                  delimiter=",", skip_header=1, dtype="int64")[:, 1:]


@cache
def 老人控除対象配偶者_配偶者控除額表():
    """
    csvファイルから値を読み込み

    老人控除対象配偶者_配偶者控除額表()[配偶者の所得区分, 納税者本人の所得区分] の形で参照可能
    """
    return np.genfromtxt("openfisca_japan/assets/所得/配偶者控除額_老人控除対象配偶者.csv",
                         delimiter=",", skip_header=1, dtype="int64")[np.newaxis, 1:]


class 給与所得控除額(Variable):
    value_type = float
    entity = 人物
    # NOTE: Variable自体は1年ごとに定義されるが、特定の日付における各種手当に計算できるように DAY で定義
    definition_period = DAY
    # Optional attribute. Allows user to declare this variable for a year.
    # OpenFisca will spread the yearly 金額 over the days contained in the year.
    set_input = set_input_divide_by_period
    label = "人物の収入に対する給与所得控除額"

    def formula_2020_01_01(対象人物, 対象期間, _parameters):
        収入 = 対象人物("収入", 対象期間)

        return np.select([収入 <= 1625000, 収入 <= 1800000, 収入 <= 3600000, 収入 <= 6600000, 収入 <= 8500000],
                         [float(550000), 収入 * 0.4 - 100000, 収入 * 0.3 + 80000, 収入 * 0.2 + 440000, 収入 * 0.1 + 1100000],
                         float(1950000))

    # TODO: 必要であれば平成28(2016)年より前の計算式も追加
    def formula_2017_01_01(対象人物, 対象期間, _parameters):
        収入 = 対象人物("収入", 対象期間)

        return np.select([収入 <= 1625000, 収入 <= 1800000, 収入 <= 3600000, 収入 <= 6600000, 収入 <= 10000000],
                         [float(650000), 収入 * 0.4, 収入 * 0.3 + 180000, 収入 * 0.2 + 540000, 収入 * 0.1 + 1200000],
                         float(2200000))


class 障害者控除(Variable):
    value_type = float
    entity = 人物
    definition_period = DAY
    label = "障害者控除額"
    reference = "https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1160.htm"

    def formula(対象人物, 対象期間, _parameters):
        # 自身が扶養に入っている、または同一生計配偶者である場合、納税者（世帯主）が控除を受ける
        扶養親族である = 対象人物("扶養親族である", 対象期間)
        同一生計配偶者である = 対象人物("同一生計配偶者である", 対象期間)
        被扶養者である = 扶養親族である + 同一生計配偶者である

        所得 = 対象人物("所得", 対象期間)
        所得降順 = 対象人物.get_rank(対象人物.世帯, -所得)
        # NOTE: 便宜上、被扶養者は所得が最も高い世帯員の扶養に入るとする
        所得が最も高い世帯員である = 所得降順 == 0

        控除対象額 = 対象人物("障害者控除対象額", 対象期間)
        # NOTE: 異なる人物に対する値であるため、人物ではなく世帯ごとに集計（でないと「扶養者である」と要素がずれてしまい計算できない)
        被扶養者の合計控除額 = 対象人物.世帯.sum(被扶養者である * 控除対象額)

        # 最も所得が高い世帯員ではないが、一定以上の所得がある場合
        扶養に入っていない納税者である = np.logical_not(所得が最も高い世帯員である) * np.logical_not(被扶養者である)
        # 被扶養者は控除を受けない（扶養者が代わりに控除を受けるため）
        return 所得が最も高い世帯員である * (被扶養者の合計控除額 + 控除対象額) + 扶養に入っていない納税者である * 控除対象額


class 障害者控除対象額(Variable):
    value_type = float
    entity = 人物
    definition_period = DAY
    label = "障害者控除額の対象額"
    reference = "https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1160.htm"
    documentation = """
    実際の控除額は同一生計配偶者、扶養親族が該当する場合にも加算される
    """

    def formula(対象人物, 対象期間, parameters):
        # 障害者控除額は対象人物ごとに算出される
        # https://www.city.hirakata.osaka.jp/kosodate/0000000544.html
        同居特別障害者控除対象 = 対象人物("同居特別障害者控除対象", 対象期間)
        # 重複して該当しないよう、同居特別障害者控除対象の場合を除外
        特別障害者控除対象 = 対象人物("特別障害者控除対象", 対象期間) * np.logical_not(同居特別障害者控除対象)
        障害者控除対象 = 対象人物("障害者控除対象", 対象期間)

        同居特別障害者控除額 = parameters(対象期間).所得.同居特別障害者控除額
        特別障害者控除額 = parameters(対象期間).所得.特別障害者控除額
        障害者控除額 = parameters(対象期間).所得.障害者控除額

        return 同居特別障害者控除対象 * 同居特別障害者控除額 + 特別障害者控除対象 * 特別障害者控除額 + 障害者控除対象 * 障害者控除額


class 障害者控除対象(Variable):
    value_type = bool
    entity = 人物
    definition_period = DAY
    label = "障害者控除の対象になるか否か"
    reference = "https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1160.htm"

    def formula(対象人物, 対象期間, _parameters):
        身体障害者手帳等級 = 対象人物("身体障害者手帳等級", 対象期間)
        精神障害者保健福祉手帳等級 = 対象人物("精神障害者保健福祉手帳等級", 対象期間)
        療育手帳等級 = 対象人物("療育手帳等級", 対象期間)
        愛の手帳等級 = 対象人物("愛の手帳等級", 対象期間)

        特別障害者控除対象 = 対象人物("特別障害者控除対象", 対象期間)

        障害者控除対象 = \
            ~特別障害者控除対象 *  \
            ((身体障害者手帳等級 != 身体障害者手帳等級パターン.無)
             + (精神障害者保健福祉手帳等級 != 精神障害者保健福祉手帳等級パターン.無)
         + (療育手帳等級 != 療育手帳等級パターン.無)
                + (愛の手帳等級 != 愛の手帳等級パターン.無))

        return 障害者控除対象


class 特別障害者控除対象(Variable):
    value_type = bool
    entity = 人物
    definition_period = DAY
    label = "特別障害者控除の対象になるか否か"
    reference = "https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1160.htm"

    def formula(対象人物, 対象期間, _parameters):
        身体障害者手帳等級 = 対象人物("身体障害者手帳等級", 対象期間)
        精神障害者保健福祉手帳等級 = 対象人物("精神障害者保健福祉手帳等級", 対象期間)
        療育手帳等級 = 対象人物("療育手帳等級", 対象期間)
        愛の手帳等級 = 対象人物("愛の手帳等級", 対象期間)

        特別障害者控除対象 = \
            (身体障害者手帳等級 == 身体障害者手帳等級パターン.一級) + \
            (身体障害者手帳等級 == 身体障害者手帳等級パターン.二級) + \
            (精神障害者保健福祉手帳等級 == 精神障害者保健福祉手帳等級パターン.一級) + \
            (療育手帳等級 == 療育手帳等級パターン.A) + \
            (愛の手帳等級 == 愛の手帳等級パターン.一度) + \
            (愛の手帳等級 == 愛の手帳等級パターン.二度)

        return 特別障害者控除対象


class 同居特別障害者控除対象(Variable):
    value_type = bool
    entity = 人物
    definition_period = DAY
    label = "同居特別障害者控除の対象になるか否か"
    reference = "https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1160.htm"

    def formula(対象人物, 対象期間, _parameters):
        特別障害者控除対象 = 対象人物("特別障害者控除対象", 対象期間)
        同一生計配偶者である = 対象人物("同一生計配偶者である", 対象期間)
        扶養親族である = 対象人物("扶養親族である", 対象期間)

        # TODO: 「同居していない親族」も世帯内で扱うようになったら以下の判定追加（現状フロントエンドでは同居している親族しか扱っていない）
        # 「納税者自身、配偶者、その納税者と生計を一にする親族のいずれかとの同居を常況としている」
        return 特別障害者控除対象 * (同一生計配偶者である | 扶養親族である)


class ひとり親控除(Variable):
    value_type = float
    entity = 人物
    definition_period = DAY
    label = "ひとり親控除額"
    reference = "https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1171.htm"

    def formula_2020_01_01(対象人物, 対象期間, parameters):
        所得 = 対象人物("所得", 対象期間)
        # 児童扶養手当の対象と異なり、父母の遺棄・DV等は考慮しない
        # (参考：児童扶養手当 https://www.city.hirakata.osaka.jp/0000026828.html)
        親である = 対象人物.has_role(世帯.親)
        子である = 対象人物.has_role(世帯.子)
        対象ひとり親 = (対象人物.世帯.sum(親である) == 1) * (対象人物.世帯.sum(子である) >= 1)
        ひとり親控除額 = parameters(対象期間).所得.ひとり親控除額
        ひとり親控除_所得制限額 = parameters(対象期間).所得.ひとり親控除_所得制限額

        return 親である * ひとり親控除額 * 対象ひとり親 * (所得 < ひとり親控除_所得制限額)


class 寡婦控除(Variable):
    value_type = float
    entity = 人物
    definition_period = DAY
    label = "寡婦控除額"
    reference = "https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1170.htm"

    def formula_2020_01_01(対象人物, 対象期間, parameters):
        所得 = 対象人物("所得", 対象期間)
        寡婦 = 対象人物("寡婦", 対象期間)
        寡婦控除額 = parameters(対象期間).所得.寡婦控除額
        寡婦控除_所得制限額 = parameters(対象期間).所得.寡婦控除_所得制限額

        return 寡婦控除額 * 寡婦 * (所得 <= 寡婦控除_所得制限額)


class 学生(Variable):
    value_type = bool
    default_value = False
    entity = 人物
    definition_period = DAY
    label = "小・中・高校、大学、専門学校、職業訓練学校等の学生"
    reference = "https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1175.htm"


class 勤労学生控除(Variable):
    value_type = float
    entity = 人物
    definition_period = DAY
    label = "勤労学生控除"
    reference = "https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1175.htm"

    def formula(対象人物, 対象期間, parameters):
        所得 = 対象人物("所得", 対象期間)
        学生である = 対象人物("学生", 対象期間)
        勤労学生控除額 = parameters(対象期間).所得.勤労学生控除額
        勤労学生_所得制限額 = parameters(対象期間).所得.勤労学生_所得制限額
        所得条件 = (所得 > 0) * (所得 <= 勤労学生_所得制限額)

        return 所得条件 * 学生である * 勤労学生控除額


class 同一生計配偶者である(Variable):
    value_type = bool
    default_value = False
    entity = 人物
    definition_period = DAY
    label = "同一生計配偶者であるか否か"
    reference = "https://www.nta.go.jp/taxes/shiraberu/shinkoku/tebiki/2022/03/order3/yogo/3-3_y15.htm"

    def formula(対象人物, 対象期間, parameters):
        所得 = 対象人物("所得", 対象期間)
        # 所得が高いほうが控除を受ける対象となる
        所得順位 = 対象人物.get_rank(対象人物.世帯, -所得, condition=対象人物.has_role(世帯.親))
        配偶者である = (所得順位 == 1)  # 親のうち所得順位が低い方が配偶者

        同一生計配偶者_所得制限額 = parameters(対象期間).所得.同一生計配偶者_所得制限額
        return 配偶者である * (所得 <= 同一生計配偶者_所得制限額)


class 配偶者控除(Variable):
    value_type = float
    entity = 人物
    definition_period = DAY
    label = "配偶者控除"
    reference = "https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1191.htm"
    documentation = """
    配偶者特別控除とは異なる。
    配偶者の所得が配偶者控除の所得制限を超えた場合でも、配偶者特別控除が適用される可能性がある。
    """

    def formula(対象人物, 対象期間, parameters):
        # 所得が高いほうが控除を受ける対象となる
        所得一覧 = 対象人物("所得", 対象期間)
        所得降順 = 対象人物.get_rank(対象人物.世帯, - 所得一覧, condition=対象人物.has_role(世帯.親))
        控除対象者である = (所得降順 == 0) * 対象人物.has_role(世帯.親)
        控除対象者の配偶者である = (所得降順 == 1) * 対象人物.has_role(世帯.親)
        控除対象者の所得 = 所得一覧 * 控除対象者である
        # NOTE: 異なる人物に対する値であるため、人物ではなく世帯ごとに集計（でないと「控除対象者の所得」と要素がずれてしまい計算できない)
        控除対象者の配偶者の所得 = 対象人物.世帯.sum(所得一覧 * 控除対象者の配偶者である)

        # 複数世帯の前世帯員のうち、自分または配偶者のroleをもつ世帯員がTrueのarray
        所得一覧 = 対象人物("所得", 対象期間)  # (全世帯員数)の長さのarray

        同一生計配偶者_所得制限額 = parameters(対象期間).所得.同一生計配偶者_所得制限額
        控除対象者の配偶者の所得区分 = np.select(
            [控除対象者の配偶者の所得 <= 同一生計配偶者_所得制限額],
            [0],
            -1).astype(int)  # intにできるようデフォルトをNoneではなく-1

        控除対象者の所得区分 = np.select(
            [控除対象者の所得 <= 9000000,
             (控除対象者の所得 > 9000000) * (控除対象者の所得 <= 9500000),
             (控除対象者の所得 > 9500000) * (控除対象者の所得 <= 10000000)],  # 複数世帯のarrayのためand, orの代わりに *. +
            list(range(3)),
            -1).astype(int)  # intにできるようデフォルトをNoneではなく-1

        対象所得区分に該当する = (控除対象者の所得区分 != -1) * (控除対象者の配偶者の所得区分 != -1)  # 控除条件

        # NOTE: その年の12/31時点の年齢を参照
        # https://www.nta.go.jp/taxes/shiraberu/taxanswer/yogo/senmon.htm#word5
        該当年12月31日 = period(f"{対象期間.start.year}-12-31")
        該当年12月31日の年齢一覧 = 対象人物("年齢", 該当年12月31日)
        控除対象者の配偶者の年齢 = 該当年12月31日の年齢一覧 * 控除対象者の配偶者である
        # NOTE: 自分ではない人物についての計算のため、世帯で計算（でないと要素がずれてしまい計算できない）
        配偶者が老人控除対象である = 対象人物.世帯.sum(控除対象者の配偶者の年齢 >= 70)
        老人控除対象配偶者控除額 = 老人控除対象配偶者_配偶者控除額表()[控除対象者の配偶者の所得区分, 控除対象者の所得区分]

        通常配偶者控除額 = 配偶者控除額表()[控除対象者の配偶者の所得区分, 控除対象者の所得区分]

        配偶者控除額 = np.logical_not(配偶者が老人控除対象である) * 通常配偶者控除額 + 配偶者が老人控除対象である * 老人控除対象配偶者控除額

        配偶者がいる = 対象人物.世帯.sum(対象人物.has_role(世帯.親)) == 2  # 控除条件

        return 控除対象者である * 配偶者がいる * 対象所得区分に該当する * 配偶者控除額


class 配偶者特別控除(Variable):
    value_type = float
    entity = 人物
    definition_period = DAY
    label = "配偶者特別控除"
    reference = "https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1195.htm"

    def formula(対象人物, 対象期間, _parameters):
        # 所得が高いほうが控除を受ける対象となる
        所得一覧 = 対象人物("所得", 対象期間)
        所得降順 = 対象人物.get_rank(対象人物.世帯, - 所得一覧, condition=対象人物.has_role(世帯.親))
        控除対象者である = (所得降順 == 0) * 対象人物.has_role(世帯.親)
        控除対象者の配偶者である = (所得降順 == 1) * 対象人物.has_role(世帯.親)
        控除対象者の所得 = 所得一覧 * 控除対象者である
        # NOTE: 異なる人物に対する値であるため、人物ではなく世帯ごとに集計（でないと「控除対象者の所得」と要素がずれてしまい計算できない)
        控除対象者の配偶者の所得 = 対象人物.世帯.sum(所得一覧 * 控除対象者の配偶者である)

        控除対象者の所得区分 = np.select(
            [控除対象者の所得 <= 9000000,
             (控除対象者の所得 > 9000000) * (控除対象者の所得 <= 9500000),
             (控除対象者の所得 > 9500000) * (控除対象者の所得 <= 10000000)],
            list(range(3)),
            -1).astype(int)

        控除対象者の配偶者の所得区分 = np.select(
            [(控除対象者の配偶者の所得 > 480000) * (控除対象者の配偶者の所得 <= 950000),
             (控除対象者の配偶者の所得 > 950000) * (控除対象者の配偶者の所得 <= 1000000),
             (控除対象者の配偶者の所得 > 1000000) * (控除対象者の配偶者の所得 <= 1050000),
             (控除対象者の配偶者の所得 > 1050000) * (控除対象者の配偶者の所得 <= 1100000),
             (控除対象者の配偶者の所得 > 1100000) * (控除対象者の配偶者の所得 <= 1150000),
             (控除対象者の配偶者の所得 > 1150000) * (控除対象者の配偶者の所得 <= 1200000),
             (控除対象者の配偶者の所得 > 1200000) * (控除対象者の配偶者の所得 <= 1250000),
             (控除対象者の配偶者の所得 > 1250000) * (控除対象者の配偶者の所得 <= 1300000),
             (控除対象者の配偶者の所得 > 1300000) * (控除対象者の配偶者の所得 <= 1330000)],
            list(range(9)),
            -1).astype(int)

        対象所得区分に該当する = (控除対象者の所得区分 != -1) * (控除対象者の配偶者の所得区分 != -1)  # 控除条件

        配偶者がいる = 対象人物.世帯.sum(対象人物.has_role(世帯.親)) == 2  # 控除条件

        return 控除対象者である * 配偶者がいる * 対象所得区分に該当する * 配偶者特別控除額表()[控除対象者の配偶者の所得区分, 控除対象者の所得区分]


class 扶養控除(Variable):
    value_type = float
    entity = 人物
    definition_period = DAY
    label = "扶養控除"
    reference = "https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1180.htm"

    def formula(対象人物, 対象期間, parameters):
        扶養親族である = 対象人物("扶養親族である", 対象期間)

        # NOTE: その年の12/31時点の年齢を参照
        # https://www.nta.go.jp/taxes/shiraberu/taxanswer/yogo/senmon.htm#word5
        該当年12月31日 = period(f"{対象期間.start.year}-12-31")
        年齢 = 対象人物("年齢", 該当年12月31日)

        控除対象扶養親族である = 扶養親族である * (年齢 >= 16)

        特定扶養親族である = 控除対象扶養親族である * (年齢 >= 19) * (年齢 < 23)
        老人扶養親族である = 控除対象扶養親族である * (年齢 >= 70)

        # NOTE: 入院中の親族は同居扱いだが老人ホーム等への入居は除く
        # TODO: 「同居していない親族」も世帯内で扱うようになったら同居老親かどうかの判定追加
        介護施設入所中 = 対象人物("介護施設入所中", 対象期間)
        同居している老人扶養親族である = 老人扶養親族である * np.logical_not(介護施設入所中)
        同居していない老人扶養親族である = 老人扶養親族である * 介護施設入所中

        # NOTE: np.selectのcondlistは最初に該当した条件で計算される
        扶養控除額 = np.select(
            [特定扶養親族である,
             同居している老人扶養親族である,
             同居していない老人扶養親族である,
             控除対象扶養親族である],
            [parameters(対象期間).所得.扶養控除_特定扶養親族,
             parameters(対象期間).所得.扶養控除_老人扶養親族_同居老親等,
             parameters(対象期間).所得.扶養控除_老人扶養親族_同居老親等以外の者,
             parameters(対象期間).所得.扶養控除_一般],
            0)

        所得 = 対象人物("所得", 対象期間)
        所得降順 = 対象人物.get_rank(対象人物.世帯, -所得)
        # NOTE: 便宜上所得が最も多い世帯員が扶養者であるとする
        扶養者である = 所得降順 == 0

        return 扶養者である * 対象人物.世帯.sum(扶養控除額)


class 扶養親族である(Variable):
    value_type = bool
    default_value = False
    entity = 人物
    definition_period = DAY
    label = "扶養親族であるか否か"
    reference = "https://www.nta.go.jp/taxes/shiraberu/taxanswer/yogo/senmon.htm"

    def formula(対象人物, 対象期間, parameters):
        扶養親族所得金額 = parameters(対象期間).所得.扶養親族所得金額
        所得 = 対象人物("所得", 対象期間)
        親である = 対象人物.has_role(世帯.親)

        # 扶養親族に配偶者は含まれない。(親等の児童以外を扶養する場合はそれらも含む必要あり)
        # 扶養親族の定義(参考): https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1180.htm
        return np.logical_not(親である) * (所得 <= 扶養親族所得金額)


class 扶養人数(Variable):
    value_type = int
    entity = 世帯
    definition_period = DAY
    label = "扶養人数"

    def formula(対象世帯, 対象期間, parameters):
        扶養親族である = 対象世帯.members("扶養親族である", 対象期間)
        # この時点でndarrayからスカラーに変換しても、他から扶養人数を取得する際はndarrayに変換されて返されてしまう
        return 対象世帯.sum(扶養親族である)


class 控除後世帯高所得(Variable):
    value_type = float
    entity = 世帯
    definition_period = DAY
    label = "各種控除が適用された後の世帯高所得額"
    reference = "https://www.city.himeji.lg.jp/waku2child/0000013409.html"

    def formula(対象世帯, 対象期間, _parameters):
        所得 = 対象世帯.members("所得", 対象期間)
        所得降順 = 対象世帯.get_rank(対象世帯, -所得)
        # 最も所得が大きい世帯員を対象とすることで、世帯高所得を算出している
        対象者である = 所得降順 == 0

        控除後所得 = 対象世帯.members("控除後所得", 対象期間)
        return 対象世帯.sum(対象者である * 控除後所得)


class 控除後所得(Variable):
    value_type = float
    entity = 人物
    definition_period = DAY
    label = "各種控除が適用された後の所得額"
    reference = "https://www.city.himeji.lg.jp/waku2child/0000013409.html"

    def formula(対象人物, 対象期間, parameters):
        所得 = 対象人物("所得", 対象期間)
        社会保険料 = parameters(対象期間).所得.社会保険料相当額
        給与所得及び雑所得からの控除額 = parameters(対象期間).所得.給与所得及び雑所得からの控除額
        障害者控除 = 対象人物("障害者控除", 対象期間)
        ひとり親控除 = 対象人物("ひとり親控除", 対象期間)
        寡婦控除 = 対象人物("寡婦控除", 対象期間)
        勤労学生控除 = 対象人物("勤労学生控除", 対象期間)

        # 他の控除（雑損控除・医療費控除等）は定額でなく実費を元に算出するため除外する
        総控除額 = 社会保険料 + 給与所得及び雑所得からの控除額 + 障害者控除 + ひとり親控除 + 寡婦控除 + 勤労学生控除

        # 負の数にならないよう、0円未満になった場合は0円に補正
        return np.clip(所得 - 総控除額, 0.0, None)


class 児童手当の控除後世帯高所得(Variable):
    value_type = float
    entity = 世帯
    definition_period = DAY
    label = "各種控除が適用された後の児童手当における世帯高所得額"
    reference = "https://www.city.himeji.lg.jp/waku2child/0000013409.html"
    documentation = """
    所得税等の控除額とは異なる。
    https://www.nta.go.jp/publication/pamph/koho/kurashi/html/01_1.htm
    """

    def formula(対象世帯, 対象期間, _parameters):
        所得 = 対象世帯.members("所得", 対象期間)
        所得降順 = 対象世帯.get_rank(対象世帯, -所得)
        # 最も所得が大きい世帯員を対象とすることで、世帯高所得を算出している
        対象者である = 所得降順 == 0

        控除後所得 = 対象世帯.members("児童手当の控除後所得", 対象期間)
        return 対象世帯.sum(対象者である * 控除後所得)


class 児童手当の控除後所得(Variable):
    value_type = float
    entity = 人物
    definition_period = DAY
    label = "各種控除が適用された後の児童手当における所得額"
    reference = "https://www.city.himeji.lg.jp/waku2child/0000013409.html"
    documentation = """
    所得税等の控除額とは異なる。
    https://www.nta.go.jp/publication/pamph/koho/kurashi/html/01_1.htm
    """

    def formula(対象人物, 対象期間, parameters):
        所得 = 対象人物("所得", 対象期間)
        社会保険料 = parameters(対象期間).所得.社会保険料相当額
        給与所得及び雑所得からの控除額 = parameters(対象期間).所得.給与所得及び雑所得からの控除額
        障害者控除 = 対象人物("障害者控除", 対象期間)
        ひとり親控除 = 対象人物("ひとり親控除", 対象期間)
        寡婦控除 = 対象人物("寡婦控除", 対象期間)
        勤労学生控除 = 対象人物("勤労学生控除", 対象期間)

        # 他の控除（雑損控除・医療費控除等）は定額でなく実費を元に算出するため除外する

        総控除額 = 社会保険料 + 給与所得及び雑所得からの控除額 + 障害者控除 + ひとり親控除 + 寡婦控除 + 勤労学生控除

        # 負の数にならないよう、0円未満になった場合は0円に補正
        return np.clip(所得 - 総控除額, 0.0, None)


class 児童扶養手当の控除後世帯高所得(Variable):
    value_type = float
    entity = 世帯
    definition_period = DAY
    label = "各種控除が適用された後の児童扶養手当の世帯高所得額"
    reference = "https://www.city.otsu.lg.jp/soshiki/015/1406/g/jidofuyoteate/1389538447829.html"

    def formula(対象世帯, 対象期間, _parameters):
        所得 = 対象世帯.members("所得", 対象期間)
        所得降順 = 対象世帯.get_rank(対象世帯, -所得)
        # 最も所得が大きい世帯員を対象とすることで、世帯高所得を算出している
        対象者である = 所得降順 == 0

        控除後所得 = 対象世帯.members("児童扶養手当の控除後所得", 対象期間)
        return 対象世帯.sum(対象者である * 控除後所得)


class 児童扶養手当の控除後所得(Variable):
    value_type = float
    entity = 人物
    definition_period = DAY
    label = "各種控除が適用された後の児童扶養手当の世帯高所得額"
    reference = "https://www.city.otsu.lg.jp/soshiki/015/1406/g/jidofuyoteate/1389538447829.html"

    def formula(対象人物, 対象期間, parameters):
        所得 = 対象人物("所得", 対象期間)
        社会保険料 = parameters(対象期間).所得.社会保険料相当額
        給与所得及び雑所得からの控除額 = parameters(対象期間).所得.給与所得及び雑所得からの控除額
        障害者控除 = 対象人物("障害者控除", 対象期間)
        勤労学生控除 = 対象人物("勤労学生控除", 対象期間)
        配偶者特別控除 = 対象人物("配偶者特別控除", 対象期間)

        # 他の控除（雑損控除・医療費控除等）は定額でなく実費を元に算出するため除外する
        # 養育者が児童の父母の場合は寡婦控除・ひとり親控除は加えられない
        総控除額 = 社会保険料 + 給与所得及び雑所得からの控除額 + 障害者控除 + 勤労学生控除 + 配偶者特別控除

        # 負の数にならないよう、0円未満になった場合は0円に補正
        return np.clip(所得 - 総控除額, 0.0, None)


class 特別児童扶養手当の控除後世帯高所得(Variable):
    value_type = float
    entity = 世帯
    definition_period = DAY
    label = "各種控除が適用された後の特別児童扶養手当における世帯高所得額"
    reference = "https://www.city.otsu.lg.jp/soshiki/015/1406/g/jidofuyoteate/1389538447829.html"

    def formula(対象世帯, 対象期間, parameters):
        所得 = 対象世帯.members("所得", 対象期間)
        所得降順 = 対象世帯.get_rank(対象世帯, -所得)
        # 最も所得が大きい世帯員を対象とすることで、世帯高所得を算出している
        対象者である = 所得降順 == 0

        控除後所得 = 対象世帯.members("特別児童扶養手当の控除後所得", 対象期間)

        return 対象世帯.sum(対象者である * 控除後所得)


class 特別児童扶養手当の控除後所得(Variable):
    value_type = float
    entity = 人物
    definition_period = DAY
    label = "各種控除が適用された後の特別児童扶養手当における所得額"
    reference = "https://www.city.otsu.lg.jp/soshiki/015/1406/g/jidofuyoteate/1389538447829.html"

    def formula(対象人物, 対象期間, parameters):
        所得 = 対象人物("所得", 対象期間)
        社会保険料 = parameters(対象期間).所得.社会保険料相当額
        給与所得及び雑所得からの控除額 = parameters(対象期間).所得.給与所得及び雑所得からの控除額
        障害者控除 = 対象人物("障害者控除", 対象期間)
        勤労学生控除 = 対象人物("勤労学生控除", 対象期間)
        ひとり親控除 = 対象人物("ひとり親控除", 対象期間)
        寡婦控除 = 対象人物("寡婦控除", 対象期間)
        配偶者特別控除 = 対象人物("配偶者特別控除", 対象期間)

        # 他の控除（雑損控除・医療費控除等）は定額でなく実費を元に算出するため除外する
        総控除額 = 社会保険料 + 給与所得及び雑所得からの控除額 + 障害者控除 + 勤労学生控除 + ひとり親控除 + 寡婦控除 + 配偶者特別控除

        # 負の数にならないよう、0円未満になった場合は0円に補正
        return np.clip(所得 - 総控除額, 0.0, None)
\`\`\`

\`\`\`python
"""
全制度で汎用的に使用するVariableを定義
"""

from openfisca_core.indexed_enums import Enum
from openfisca_core.periods import DAY
from openfisca_core.variables import Variable
from openfisca_japan.entities import 人物


class 小学生学年(Enum):
    __order__ = "一年生 二年生 三年生 四年生 五年生 六年生"
    一年生 = 1
    二年生 = 2
    三年生 = 3
    四年生 = 4
    五年生 = 5
    六年生 = 6


class 中学生学年(Enum):
    __order__ = "一年生 二年生 三年生"
    一年生 = 7
    二年生 = 8
    三年生 = 9


class 高校生学年(Enum):
    __order__ = "一年生 二年生 三年生"
    一年生 = 10
    二年生 = 11
    三年生 = 12


class 性別パターン(Enum):
    __order__ = "女性 男性 その他"
    女性 = "女性"
    男性 = "男性"
    その他 = "その他"


class 性別(Variable):
    value_type = Enum
    possible_values = 性別パターン
    default_value = 性別パターン.その他
    entity = 人物
    definition_period = DAY
    label = "人物の性別"
\`\`\`

\`\`\`python
"""
被災者の住宅に関するVariableを定義
"""

from openfisca_core.indexed_enums import Enum
from openfisca_core.periods import DAY
from openfisca_core.variables import Variable
from openfisca_japan.entities import 世帯, 人物


class 住宅被害パターン(Enum):
    __order__ = "無 中規模半壊 大規模半壊 長期避難 解体 全壊 滅失または流失"
    無 = "無"
    中規模半壊 = "中規模半壊"
    大規模半壊 = "大規模半壊"
    長期避難 = "長期避難"
    解体 = "解体"
    全壊 = "全壊"
    滅失または流失 = "滅失または流失"


class 住宅被害(Variable):
    value_type = Enum
    possible_values = 住宅被害パターン
    default_value = 住宅被害パターン.無
    entity = 世帯
    definition_period = DAY
    label = "被災者の住宅被害"


class 住宅再建方法パターン(Enum):
    __order__ = "無 建設または購入 補修 賃借"
    無 = "無"
    建設または購入 = "建設または購入"
    補修 = "補修"
    賃借 = "賃借"


class 住宅再建方法(Variable):
    value_type = Enum
    possible_values = 住宅再建方法パターン
    default_value = 住宅再建方法パターン.無
    entity = 世帯
    definition_period = DAY
    label = "被災者の住宅再建方法"


class 家財の損害パターン(Enum):
    # TODO: 他制度でより細かい分類が必要になったら追加
    __order__ = "無 三分の一未満 三分の一以上"
    無 = "無"
    三分の一未満 = "三分の一未満"
    三分の一以上 = "三分の一以上"


class 家財の損害(Variable):
    value_type = Enum
    possible_values = 家財の損害パターン
    default_value = 家財の損害パターン.無
    entity = 世帯
    definition_period = DAY
    label = "被災者の住宅の家財の損害"


class 災害による負傷の療養期間パターン(Enum):
    # TODO: 他制度でより細かい分類が必要になったら追加
    __order__ = "無 一か月未満 一か月以上"
    無 = "無"
    一か月未満 = "一か月未満"
    一か月以上 = "一か月以上"


class 災害による負傷の療養期間(Variable):
    value_type = Enum
    possible_values = 災害による負傷の療養期間パターン
    default_value = 災害による負傷の療養期間パターン.無
    entity = 人物
    definition_period = DAY
    label = "災害により負傷した被災者の療養期間"
\`\`\`

\`\`\`python
"""
災害関連で共通して使用するVariableを定義
"""

from openfisca_core.periods import DAY
from openfisca_core.variables import Variable
from openfisca_japan.entities import 世帯


class 被災している(Variable):
    value_type = bool
    entity = 世帯
    definition_period = DAY
    label = "被災しているかどうか"
\`\`\`

\`\`\`python
"""
災害弔慰金の実装
"""

import numpy as np
from openfisca_core.periods import DAY
from openfisca_core.variables import Variable
from openfisca_japan.entities import 世帯


class 災害弔慰金(Variable):
    value_type = int
    entity = 世帯
    definition_period = DAY
    label = "災害弔慰金"
    reference = "https://www.bousai.go.jp/taisaku/choui/pdf/siryo1-1.pdf"
    documentation = """
    算出方法は以下リンクも参考になる。
    https://www.city.hino.lg.jp/kurashi/annzen/hisai/1011473.html
    """

    def formula(対象世帯, 対象期間, parameters):
        災害救助法の適用地域である = 対象世帯("災害救助法の適用地域である", 対象期間)

        災害で死亡した世帯員の人数 = 対象世帯("災害で死亡した世帯員の人数", 対象期間)
        災害で生計維持者が死亡した = 対象世帯("災害で生計維持者が死亡した", 対象期間)

        生計維持者死亡の場合の支給額 = parameters(対象期間).災害.支援.災害弔慰金.生計維持者死亡の場合の支給額
        生計維持者以外死亡の場合の支給額 = parameters(対象期間).災害.支援.災害弔慰金.生計維持者以外死亡の場合の支給額

        支給額 = np.select(
            [災害で生計維持者が死亡した],
            [生計維持者死亡の場合の支給額 + (災害で死亡した世帯員の人数 - 1) * 生計維持者以外死亡の場合の支給額],
            災害で死亡した世帯員の人数 * 生計維持者以外死亡の場合の支給額).astype(int)

        return 災害救助法の適用地域である * 支給額


class 災害で死亡した世帯員の人数(Variable):
    value_type = int
    entity = 世帯
    definition_period = DAY
    label = "災害で死亡した世帯員の人数"
    reference = "https://www.bousai.go.jp/taisaku/choui/pdf/siryo1-1.pdf"
    documentation = """
    死亡した世帯員は世帯情報に含められない（含めると他の制度の対象になってしまう）ため、死亡者に関するVariableを別途用意
    """


class 災害で生計維持者が死亡した(Variable):
    value_type = bool
    entity = 世帯
    definition_period = DAY
    label = "災害で生計維持者が死亡したかどうか"
    reference = "https://www.bousai.go.jp/taisaku/choui/pdf/siryo1-1.pdf"
    documentation = """
    死亡した世帯員は世帯情報に含められない（含めると他の制度の対象になってしまう）ため、死亡者に関するVariableを別途用意
    """
\`\`\`

\`\`\`python
"""
被災者生活再建支援制度の実装
"""


from functools import cache

import numpy as np
from openfisca_core.periods import DAY
from openfisca_core.variables import Variable
from openfisca_japan.entities import 世帯
from openfisca_japan.variables.災害.住宅 import 住宅再建方法パターン, 住宅被害パターン


@cache
def 基礎支援金額表():
    """
    csvファイルから値を読み込み

    基礎支援金額表()[住宅被害] の形で参照可能
    """
    return np.genfromtxt("openfisca_japan/assets/災害/支援/被災者生活再建支援制度_基礎支援金.csv",
                  delimiter=",", skip_header=1, dtype="int64")[1:]


@cache
def 加算支援金額表():
    """
    csvファイルから値を読み込み

    加算支援金額表()[住宅被害, 住宅再建方法] の形で参照可能
    """
    return np.genfromtxt("openfisca_japan/assets/災害/支援/被災者生活再建支援制度_加算支援金.csv",
                  delimiter=",", skip_header=1, dtype="int64")[:, 1:]


class 被災者生活再建支援法の適用地域である(Variable):
    value_type = bool
    entity = 世帯
    definition_period = DAY
    label = "被災者生活再建支援法の適用地域であるかどうか"
    reference = "https://www.bousai.go.jp/taisaku/seikatsusaiken/pdf/140612gaiyou.pdf"
    documentation = """
    自然災害ごとに、市区町村ごとに適用有無が決まる
    災害発生時は適用有無が変化していくので注意
    """
    # TODO: 居住市区町村から支援法が適用されているかどうかを計算できるようにする


class 被災者生活再建支援制度(Variable):
    value_type = int
    entity = 世帯
    definition_period = DAY
    label = "被災者生活再建支援制度"
    reference = "https://www.bousai.go.jp/taisaku/seikatsusaiken/pdf/140612gaiyou.pdf"
    documentation = """
    対象となる自然災害は都道府県が公示

    算出方法は以下リンクも参考になる。
    https://www.bousai.go.jp/taisaku/hisaisyagyousei/pdf/kakusyuseido_tsuujou.pdf
    """

    def formula(対象世帯, 対象期間, _parameters):
        被災者生活再建支援法の適用地域である = 対象世帯("被災者生活再建支援法の適用地域である", 対象期間)
        基礎支援金 = 対象世帯("被災者生活再建支援制度_基礎支援金", 対象期間)
        加算支援金 = 対象世帯("被災者生活再建支援制度_加算支援金", 対象期間)

        世帯人数 = 対象世帯("世帯人数", 対象期間)
        世帯人数に応じた倍率 = np.select(
            [世帯人数 == 1],
            [0.75],
            1)

        return 被災者生活再建支援法の適用地域である * 世帯人数に応じた倍率 * (基礎支援金 + 加算支援金)


class 被災者生活再建支援制度_基礎支援金(Variable):
    value_type = int
    entity = 世帯
    definition_period = DAY
    label = "被災者生活再建支援制度における基礎支援金"
    reference = "https://www.bousai.go.jp/taisaku/seikatsusaiken/pdf/140612gaiyou.pdf"

    def formula(対象世帯, 対象期間, _parameters):
        住宅被害 = 対象世帯("住宅被害", 対象期間)
        支援制度対象である = 住宅被害 != 住宅被害パターン.無

        住宅被害区分 = np.select(
            [住宅被害 == 住宅被害パターン.滅失または流失,
             住宅被害 == 住宅被害パターン.全壊,
             住宅被害 == 住宅被害パターン.解体,
             住宅被害 == 住宅被害パターン.長期避難,
             住宅被害 == 住宅被害パターン.大規模半壊,
             住宅被害 == 住宅被害パターン.中規模半壊],
            list(range(6)),
            -1).astype(int)  # intにできるようデフォルトをNoneではなく-1

        基礎支援金額 = 基礎支援金額表()[住宅被害区分]
        return 支援制度対象である * 基礎支援金額


class 被災者生活再建支援制度_加算支援金(Variable):
    value_type = int
    entity = 世帯
    definition_period = DAY
    label = "被災者生活再建支援制度における加算支援金"
    reference = "https://www.bousai.go.jp/taisaku/seikatsusaiken/pdf/140612gaiyou.pdf"

    def formula(対象世帯, 対象期間, _parameters):
        住宅被害 = 対象世帯("住宅被害", 対象期間)
        住宅再建方法 = 対象世帯("住宅再建方法", 対象期間)
        支援制度対象である = (住宅被害 != 住宅被害パターン.無) * (住宅再建方法 != 住宅再建方法パターン.無)

        住宅被害区分 = np.select(
            [住宅被害 == 住宅被害パターン.滅失または流失,
             住宅被害 == 住宅被害パターン.全壊,
             住宅被害 == 住宅被害パターン.解体,
             住宅被害 == 住宅被害パターン.長期避難,
             住宅被害 == 住宅被害パターン.大規模半壊,
             住宅被害 == 住宅被害パターン.中規模半壊],
            list(range(6)),
            -1).astype(int)  # intにできるようデフォルトをNoneではなく-1

        住宅再建方法区分 = np.select(
            [住宅再建方法 == 住宅再建方法パターン.建設または購入,
             住宅再建方法 == 住宅再建方法パターン.補修,
             住宅再建方法 == 住宅再建方法パターン.賃借],
            list(range(3)),
            -1).astype(int)  # intにできるようデフォルトをNoneではなく-1

        加算支援金額 = 加算支援金額表()[住宅被害区分, 住宅再建方法区分]
        return 支援制度対象である * 加算支援金額
\`\`\`

\`\`\`python
"""
災害援護資金の実装
"""

from functools import cache

import numpy as np
from openfisca_core.periods import DAY
from openfisca_core.variables import Variable
from openfisca_japan.entities import 世帯
from openfisca_japan.variables.災害.住宅 import 住宅被害パターン, 家財の損害パターン, 災害による負傷の療養期間パターン


@cache
def 災害援護資金貸付限度額():
    """
    csvファイルから値を読み込み

    災害援護資金貸付限度額()[災害による負傷の療養期間, 住宅への損害] の形で参照可能
    """
    return np.genfromtxt("openfisca_japan/assets/災害/支援/災害援護資金貸付限度額.csv",
                  delimiter=",", skip_header=1, dtype="int64")[:, 1:]


class 災害援護資金(Variable):
    value_type = int
    entity = 世帯
    definition_period = DAY
    label = "災害援護資金"
    reference = "https://www.bousai.go.jp/taisaku/hisaisyagyousei/pdf/kakusyuseido_tsuujou.pdf"
    documentation = """
    算出方法は以下リンクも参考になる。
    https://www.mhlw.go.jp/shinsai_jouhou/saigaishien.html
    """

    def formula(対象世帯, 対象期間, _parameters):
        災害救助法の適用地域である = 対象世帯("災害救助法の適用地域である", 対象期間)

        家財の損害 = 対象世帯("家財の損害", 対象期間)
        住宅被害 = 対象世帯("住宅被害", 対象期間)

        所得一覧 = 対象世帯.members("所得", 対象期間)
        所得降順 = 対象世帯.get_rank(対象世帯, -所得一覧)
        # NOTE: 厳密には世帯主は所得の多寡のみでは決まらないが、便宜上所得が最も多い世帯員を世帯主とする
        世帯主である = 所得降順 == 0

        災害による負傷の療養期間 = 対象世帯.members("災害による負傷の療養期間", 対象期間)

        世帯主が療養一か月以上の負傷をしている = 対象世帯.any((災害による負傷の療養期間 == 災害による負傷の療養期間パターン.一か月以上) * 世帯主である)

        災害による負傷の療養期間区分 = np.select(
            [世帯主が療養一か月以上の負傷をしている],
            [1],
            0).astype(int)

        住宅への損害区分 = np.select(
            [(家財の損害 == 家財の損害パターン.三分の一以上) * (住宅被害 == 住宅被害パターン.無),
             (住宅被害 == 住宅被害パターン.中規模半壊) + (住宅被害 == 住宅被害パターン.大規模半壊),
             (住宅被害 == 住宅被害パターン.全壊),
             # 住宅の解体が必要な場合厳密には半壊だった場合のみ金額が異なるが、解体前の住居の状態を入力上識別できないため一律同額とする
             # https://www.mhlw.go.jp/shinsai_jouhou/dl/shikingaiyou.pdf
             # 災害援護資金の条件に長期避難は記載されていないが、住宅被害パターンから1つのみを選択するため加える
             (住宅被害 == 住宅被害パターン.滅失または流失) + (住宅被害 == 住宅被害パターン.解体) + (住宅被害 == 住宅被害パターン.長期避難)],
            [1, 2, 3, 4],
            0).astype(int)

        災害援護資金_所得制限額 = 対象世帯("災害援護資金_所得制限額", 対象期間)
        所得制限以下である = 対象世帯.sum(所得一覧) <= 災害援護資金_所得制限額

        災害援護資金額 = 災害援護資金貸付限度額()[災害による負傷の療養期間区分, 住宅への損害区分]

        return 災害救助法の適用地域である * 所得制限以下である * 災害援護資金額


class 災害援護資金_所得制限額(Variable):
    value_type = int
    entity = 世帯
    definition_period = DAY
    label = "災害援護資金における所得制限額"
    reference = "https://www.bousai.go.jp/taisaku/hisaisyagyousei/pdf/kakusyuseido_tsuujou.pdf"
    documentation = """
    「住居が滅失した場合」には全壊、全焼、流出も含まれる
    https://www.mhlw.go.jp/bunya/seikatsuhogo/dl/saigaikyujo6h_03.pdf
    """

    def formula(対象世帯, 対象期間, parameters):
        世帯人数 = 対象世帯("世帯人数", 対象期間)
        住宅被害 = 対象世帯("住宅被害", 対象期間)

        世帯人数ごとの所得制限額 = np.array(parameters(対象期間).災害.支援.災害援護資金.所得制限額)  # 複数世帯入力(2以上の長さのndarray入力)対応のためndarray化
        所得制限額_一人当たり追加額 = parameters(対象期間).災害.支援.災害援護資金.所得制限額_一人当たり追加額
        所得制限額_住居が滅失した場合 = parameters(対象期間).災害.支援.災害援護資金.所得制限額_住居が滅失した場合

        所得制限額 = np.select(
            [(住宅被害 == 住宅被害パターン.滅失または流失) + (住宅被害 == 住宅被害パターン.全壊),
             世帯人数 <= 4,
             世帯人数 > 4],
            [所得制限額_住居が滅失した場合,
             世帯人数ごとの所得制限額[np.clip(世帯人数, 0, 4)],  # HACK: out of rangeを防ぐためインデックスを4以下に制限（np.selectは条件に合わない式も計算されるため）
             世帯人数ごとの所得制限額[4] + (世帯人数 - 4) * 所得制限額_一人当たり追加額],
            0).astype(int)

        return 所得制限額
\`\`\`

\`\`\`python
"""
災害障害見舞金の実装
"""


from openfisca_core.periods import DAY
from openfisca_core.variables import Variable
from openfisca_japan.entities import 世帯, 人物


class 災害救助法の適用地域である(Variable):
    value_type = bool
    entity = 世帯
    definition_period = DAY
    label = "災害救助法の適用地域であるかどうか"
    reference = "https://elaws.e-gov.go.jp/document?lawid=322AC0000000118"
    documentation = """
    自然災害ごとに、市区町村ごとに適用有無が決まる
    災害発生時は適用有無が変化していくので注意
    適用状況 https://www.bousai.go.jp/taisaku/kyuujo/kyuujo_tekiyou.html
    """
    # TODO: 居住市区町村から災害救助法が適用されているかどうかを計算できるようにする


class 災害障害見舞金_最大(Variable):
    value_type = int
    entity = 世帯
    definition_period = DAY
    label = "災害障害見舞金の最大額"
    reference = "https://www.bousai.go.jp/taisaku/choui/pdf/siryo1-1.pdf"
    documentation = """
    算出方法は以下リンクも参考になる。
    https://www.city.hino.lg.jp/kurashi/annzen/hisai/1011473.html
    """

    def formula(対象世帯, 対象期間, parameters):
        災害救助法の適用地域である = 対象世帯("災害救助法の適用地域である", 対象期間)

        災害による重い後遺障害がある = 対象世帯.members("災害による重い後遺障害がある", 対象期間)

        生計維持者への支給額 = parameters(対象期間).災害.支援.災害障害見舞金.生計維持者への支給額
        生計維持者以外への支給額 = parameters(対象期間).災害.支援.災害障害見舞金.生計維持者以外への支給額

        所得一覧 = 対象世帯.members("所得", 対象期間)
        所得降順 = 対象世帯.get_rank(対象世帯, -所得一覧)

        # NOTE: 厳密な生計維持者の判定には被災前の各世帯員の所得と比較が必要だが、簡便のため所得が最も多い世帯員を生計維持者の候補とする
        # （災害関連の計算で入力される「収入」は「被災前の収入」を指すため、被災による収入変化は影響しない）
        # また、世帯所得制限額についても柔軟な対応が取られているため計算式には入れない
        # 災害弔慰金等、災害援護資金関係 https://www.bousai.go.jp/taisaku/kyuujo/pdf/h30kaigi/siryo3-1.pdf
        生計維持者である = 所得降順 == 0
        生計維持者以外 = 所得降順 != 0
        対象生計維持者人数 = 対象世帯.sum(災害による重い後遺障害がある * 生計維持者である)
        対象生計維持者以外人数 = 対象世帯.sum(災害による重い後遺障害がある * 生計維持者以外)
        支給額 = 対象生計維持者人数 * 生計維持者への支給額 + 対象生計維持者以外人数 * 生計維持者以外への支給額

        return 災害救助法の適用地域である * 支給額


class 災害障害見舞金_最小(Variable):
    value_type = int
    entity = 世帯
    definition_period = DAY
    label = "災害障害見舞金の最小額"
    reference = "https://www.bousai.go.jp/taisaku/choui/pdf/siryo1-1.pdf"
    documentation = """
    算出方法は以下リンクも参考になる。
    https://www.city.hino.lg.jp/kurashi/annzen/hisai/1011473.html
    """

    def formula(対象世帯, 対象期間, parameters):
        災害救助法の適用地域である = 対象世帯("災害救助法の適用地域である", 対象期間)

        災害による重い後遺障害がある = 対象世帯.members("災害による重い後遺障害がある", 対象期間)
        生計維持者以外への支給額 = parameters(対象期間).災害.支援.災害障害見舞金.生計維持者以外への支給額

        支給額 = 対象世帯.sum(災害による重い後遺障害がある) * 生計維持者以外への支給額
        return 災害救助法の適用地域である * 支給額


class 災害による重い後遺障害がある(Variable):
    value_type = bool
    entity = 人物
    definition_period = DAY
    label = "災害による重い後遺障害がある"
    reference = "https://www.city.hino.lg.jp/kurashi/annzen/hisai/1011473.html"
\`\`\`

\`\`\`python
"""
障害児福祉手当の実装
"""
import numpy as np
from openfisca_core.periods import DAY
from openfisca_core.variables import Variable
from openfisca_japan.entities import 世帯, 人物
from openfisca_japan.variables.障害.愛の手帳 import 愛の手帳等級パターン
from openfisca_japan.variables.障害.療育手帳 import 療育手帳等級パターン
from openfisca_japan.variables.障害.身体障害者手帳 import 身体障害者手帳等級パターン


class 障害児福祉手当(Variable):
    value_type = float
    entity = 世帯
    definition_period = DAY
    label = "障害児童福祉手当"
    reference = "https://www.mhlw.go.jp/bunya/shougaihoken/jidou/hukushi.html"
    documentation = """
    手帳について要件は無いが、目安となる等級をもとに算出
    https://h-navi.jp/column/article/35029230
    """

    # TODO: 重度心身障害者手当所得制限と同じ控除を適用する
    # https://www.fukushi.metro.tokyo.lg.jp/shinsho/teate/jidou.html

    def formula(対象世帯, 対象期間, parameters):
        障害児福祉手当 = parameters(対象期間).福祉.育児.障害児福祉手当

        所得一覧 = 対象世帯.members("所得", 対象期間)
        身体障害者手帳等級一覧 = 対象世帯.members("身体障害者手帳等級", 対象期間)
        療育手帳等級一覧 = 対象世帯.members("療育手帳等級", 対象期間)
        愛の手帳等級一覧 = 対象世帯.members("愛の手帳等級", 対象期間)
        年齢 = 対象世帯.members("年齢", 対象期間)
        上限年齢未満 = 年齢 < 障害児福祉手当.上限年齢

        対象障害者手帳等級 = \
            (身体障害者手帳等級一覧 == 身体障害者手帳等級パターン.一級) + \
            (身体障害者手帳等級一覧 == 身体障害者手帳等級パターン.二級) + \
            (療育手帳等級一覧 == 療育手帳等級パターン.A) + \
            (療育手帳等級一覧 == 療育手帳等級パターン.B) + \
            (愛の手帳等級一覧 == 愛の手帳等級パターン.一度) + \
            (愛の手帳等級一覧 == 愛の手帳等級パターン.二度)

        対象障害者である = 上限年齢未満 * 対象障害者手帳等級
        # 障害児はほとんど控除が該当しないと考える
        対象障害者の所得 = 対象障害者である * 所得一覧

        受給者の所得制限限度額 = 対象世帯.members("障害児福祉手当_受給者の所得制限限度額", 対象期間)
        受給者の所得条件 = 対象障害者の所得 < 受給者の所得制限限度額

        # 世帯高所得は保護者によるものだと想定する
        世帯高所得 = 対象世帯("控除後世帯高所得", 対象期間)
        扶養義務者の所得制限限度額 = 対象世帯("障害児福祉手当_扶養義務者の所得制限限度額", 対象期間)
        扶養義務者の所得条件 = 世帯高所得 < 扶養義務者の所得制限限度額

        # 障害児福祉手当は対象障害者が受給者のため、世帯では対象障害者の人数分支給される。
        # NOTE: 受給者の所得条件は人物、扶養義務者の所得条件は世帯ごとに計算しているため式中の登場個所が異なる
        手当金額 = 対象世帯.sum(受給者の所得条件 * 対象障害者である * 障害児福祉手当.金額)

        return 扶養義務者の所得条件 * 手当金額


class 障害児福祉手当_受給者の所得制限限度額(Variable):
    value_type = float
    entity = 人物
    definition_period = DAY
    label = "障害児童福祉手当における、受給者の所得制限限度額"
    reference = "https://www.mhlw.go.jp/bunya/shougaihoken/jidou/hukushi.html"

    def formula(対象人物, 対象期間, parameters):
        扶養人数 = 対象人物.世帯("扶養人数", 対象期間)

        # NOTE: 直接 \`受給者[扶養人数]\` のように要素参照すると型が合わず複数世帯の場合に計算できないためnp.selectを使用
        障害児福祉手当 = parameters(対象期間).福祉.育児.障害児福祉手当
        受給者の所得制限限度額 = np.select(
            [扶養人数 == i for i in range(10)],
            [障害児福祉手当.所得制限限度額.受給者[i] for i in range(10)],
            -1).astype(int)

        return 受給者の所得制限限度額


class 障害児福祉手当_扶養義務者の所得制限限度額(Variable):
    value_type = float
    entity = 世帯
    definition_period = DAY
    label = "障害児童福祉手当における、扶養義務者の所得制限限度額"
    reference = "https://www.mhlw.go.jp/bunya/shougaihoken/jidou/hukushi.html"
    documentation = """
    便宜上最も所得が多い世帯員を扶養義務者としているため、この値は世帯ごとに計算される
    """

    def formula(対象世帯, 対象期間, parameters):
        扶養人数 = 対象世帯("扶養人数", 対象期間)

        # NOTE: 直接 \`受給者[扶養人数]\` のように要素参照すると型が合わず複数世帯の場合に計算できないためnp.selectを使用
        障害児福祉手当 = parameters(対象期間).福祉.育児.障害児福祉手当
        扶養義務者の所得制限限度額 = np.select(
            [扶養人数 == i for i in range(10)],
            [障害児福祉手当.所得制限限度額.扶養義務者[i] for i in range(10)],
            -1).astype(int)

        return 扶養義務者の所得制限限度額
\`\`\`

\`\`\`python
"""
児童扶養手当の実装
"""

import numpy as np
from openfisca_core.periods import DAY
from openfisca_core.variables import Variable
from openfisca_japan.entities import 世帯
from openfisca_japan.variables.障害.愛の手帳 import 愛の手帳等級パターン
from openfisca_japan.variables.障害.療育手帳 import 療育手帳等級パターン
from openfisca_japan.variables.障害.精神障害者保健福祉手帳 import 精神障害者保健福祉手帳等級パターン
from openfisca_japan.variables.障害.身体障害者手帳 import 身体障害者手帳等級パターン


class 児童扶養手当_最大(Variable):
    value_type = float
    entity = 世帯
    definition_period = DAY
    label = "保護者への児童扶養手当の最大額"
    reference = "https://www.cfa.go.jp/policies/hitori-oya/fuyou-teate/"
    documentation = """
    児童扶養手当制度
    """

    def formula(対象世帯, 対象期間, parameters):
        児童扶養手当 = parameters(対象期間).福祉.育児.児童扶養手当

        全部支給所得条件 = 対象世帯("児童扶養手当の全部支給所得条件", 対象期間)
        一部支給所得条件 = 対象世帯("児童扶養手当の一部支給所得条件", 対象期間)
        ひとり親世帯である = 対象世帯("ひとり親", 対象期間)
        手当条件 = ひとり親世帯である * (全部支給所得条件 + 一部支給所得条件)

        最大支給額児童1人 = 全部支給所得条件 * 児童扶養手当.金額.全部支給.児童1人 + 一部支給所得条件 * 児童扶養手当.金額.一部支給_最大額.児童1人
        最大支給額児童2人 = 全部支給所得条件 * 児童扶養手当.金額.全部支給.児童2人 + 一部支給所得条件 * 児童扶養手当.金額.一部支給_最大額.児童2人
        最大支給額児童3人目以降 = 全部支給所得条件 * 児童扶養手当.金額.全部支給.児童3人目以降 + 一部支給所得条件 * 児童扶養手当.金額.一部支給_最大額.児童3人目以降

        対象児童人数 = 対象世帯("児童扶養手当の対象児童人数", 対象期間)

        # 児童の人数に応じて手当金額を変える
        # TODO: 一部支給の場合に対応する。(手当額の算出方法不明)
        # TODO: 公的年金額が児童扶養手当額より低い場合はその差額を児童扶養手当として受け取れる
        # 参考：https://www.city.shibuya.tokyo.jp/kodomo/teate/hitorioya/heikyu.html
        手当金額 = \
            ((対象児童人数 == 1) * 最大支給額児童1人) +\
            ((対象児童人数 == 2) * (最大支給額児童1人 + 最大支給額児童2人)) +\
            ((対象児童人数 > 2) * (最大支給額児童1人 + 最大支給額児童2人 + (最大支給額児童3人目以降 * (対象児童人数 - 2))))

        return 手当条件 * 手当金額


class 児童扶養手当_最小(Variable):
    value_type = float
    entity = 世帯
    definition_period = DAY
    label = "保護者への児童扶養手当の最小額"
    reference = "https://www.cfa.go.jp/policies/hitori-oya/fuyou-teate/"
    documentation = """
    児童扶養手当制度
    """

    def formula(対象世帯, 対象期間, parameters):
        児童扶養手当 = parameters(対象期間).福祉.育児.児童扶養手当

        全部支給所得条件 = 対象世帯("児童扶養手当の全部支給所得条件", 対象期間)
        一部支給所得条件 = 対象世帯("児童扶養手当の一部支給所得条件", 対象期間)
        ひとり親世帯である = 対象世帯("ひとり親", 対象期間)
        手当条件 = ひとり親世帯である * (全部支給所得条件 + 一部支給所得条件)

        最小支給額児童1人 = 全部支給所得条件 * 児童扶養手当.金額.全部支給.児童1人 + 一部支給所得条件 * 児童扶養手当.金額.一部支給_最小額.児童1人
        最小支給額児童2人 = 全部支給所得条件 * 児童扶養手当.金額.全部支給.児童2人 + 一部支給所得条件 * 児童扶養手当.金額.一部支給_最小額.児童2人
        最小支給額児童3人目以降 = 全部支給所得条件 * 児童扶養手当.金額.全部支給.児童3人目以降 + 一部支給所得条件 * 児童扶養手当.金額.一部支給_最小額.児童3人目以降

        対象児童人数 = 対象世帯("児童扶養手当の対象児童人数", 対象期間)

        # 児童の人数に応じて手当金額を変える
        # TODO: 一部支給の場合に対応する。(手当額の算出方法不明)
        # TODO: 公的年金額が児童扶養手当額より低い場合はその差額を児童扶養手当として受け取れる
        # 参考：https://www.city.shibuya.tokyo.jp/kodomo/teate/hitorioya/heikyu.html
        手当金額 = \
            ((対象児童人数 == 1) * 最小支給額児童1人) +\
            ((対象児童人数 == 2) * (最小支給額児童1人 + 最小支給額児童2人)) +\
            ((対象児童人数 > 2) * (最小支給額児童1人 + 最小支給額児童2人 + (最小支給額児童3人目以降 * (対象児童人数 - 2))))

        return 手当条件 * 手当金額


class 児童扶養手当の全部支給所得条件(Variable):
    value_type = float
    entity = 世帯
    definition_period = DAY
    label = "保護者への児童扶養手当の全額支給所得条件"
    reference = "https://www.cfa.go.jp/policies/hitori-oya/fuyou-teate/"
    documentation = """
    児童扶養手当制度
    """

    def formula(対象世帯, 対象期間, parameters):
        児童扶養手当 = parameters(対象期間).福祉.育児.児童扶養手当

        # 世帯で最も高い所得の人が基準となる
        世帯高所得 = 対象世帯("児童扶養手当の控除後世帯高所得", 対象期間)

        扶養人数 = 対象世帯("扶養人数", 対象期間)

        # 所得が全部支給所得制限限度額よりも高かったら一部支給になる
        # NOTE: 直接 \`全部支給[扶養人数]\` のように要素参照すると型が合わず複数世帯の場合に計算できないためnp.selectを使用
        全部支給所得制限限度額 = np.select(
            [扶養人数 == i for i in range(10)],
            [児童扶養手当.所得制限限度額.全部支給[i] for i in range(10)],
            -1).astype(int)

        全部支給所得条件 = 世帯高所得 < 全部支給所得制限限度額

        return 全部支給所得条件


class 児童扶養手当の一部支給所得条件(Variable):
    value_type = float
    entity = 世帯
    definition_period = DAY
    label = "保護者への児童扶養手当の一部支給所得条件"
    reference = "https://www.cfa.go.jp/policies/hitori-oya/fuyou-teate/"
    documentation = """
    児童扶養手当制度
    """

    def formula(対象世帯, 対象期間, parameters):
        児童扶養手当 = parameters(対象期間).福祉.育児.児童扶養手当

        # 世帯で最も高い所得の人が基準となる
        世帯高所得 = 対象世帯("児童扶養手当の控除後世帯高所得", 対象期間)

        扶養人数 = 対象世帯("扶養人数", 対象期間)

        # NOTE: 直接 \`全部支給[扶養人数]\` のように要素参照すると型が合わず複数世帯の場合に計算できないためnp.selectを使用
        全部支給所得制限限度額 = np.select(
            [扶養人数 == i for i in range(10)],
            [児童扶養手当.所得制限限度額.全部支給[i] for i in range(10)],
            -1).astype(int)

        一部支給所得制限限度額 = np.select(
            [扶養人数 == i for i in range(10)],
            [児童扶養手当.所得制限限度額.一部支給[i] for i in range(10)],
            -1).astype(int)

        # 所得が全部支給所得制限限度額よりも高かったら一部支給になる
        # 所得が一部支給所得制限限度額よりも高かったら支給なしになる
        一部支給所得条件 = (世帯高所得 >= 全部支給所得制限限度額) * (世帯高所得 < 一部支給所得制限限度額)

        return 一部支給所得条件


class 児童扶養手当の対象児童人数(Variable):
    value_type = float
    entity = 世帯
    definition_period = DAY
    label = "保護者への児童扶養手当の対象児童人数"
    reference = "https://www.cfa.go.jp/policies/hitori-oya/fuyou-teate/"
    documentation = """
    児童扶養手当制度
    """

    def formula(対象世帯, 対象期間, parameters):
        児童扶養手当 = parameters(対象期間).福祉.育児.児童扶養手当

        学年 = 対象世帯.members("学年", 対象期間)
        上限学年以下児童 = 学年 <= 児童扶養手当.上限学年

        # 特別児童扶養手当2級と同じ程度以上の障害を持つ児童は20歳未満まで対象
        # 参考：https://www.city.nagato.yamaguchi.jp/site/nagato-kosodatenavi/43285.html
        身体障害者手帳等級一覧 = 対象世帯.members("身体障害者手帳等級", 対象期間)
        療育手帳等級一覧 = 対象世帯.members("療育手帳等級", 対象期間)
        愛の手帳等級一覧 = 対象世帯.members("愛の手帳等級", 対象期間)
        精神障害者保健福祉手帳等級一覧 = 対象世帯.members("精神障害者保健福祉手帳等級", 対象期間)

        # 精神障害者保健福祉手帳の等級は以下の中標津町のHPを参照
        # https://www.nakashibetsu.jp/kurashi/kosodate_fukushi/shougaisha/teate/tokubetujidou/
        # 内部障害は対象になるか不明のため含めない
        対象障害者手帳等級 = \
            (身体障害者手帳等級一覧 == 身体障害者手帳等級パターン.一級) + \
            (身体障害者手帳等級一覧 == 身体障害者手帳等級パターン.二級) + \
            (身体障害者手帳等級一覧 == 身体障害者手帳等級パターン.三級) + \
            (療育手帳等級一覧 == 療育手帳等級パターン.A) + \
            (療育手帳等級一覧 == 療育手帳等級パターン.B) + \
            (愛の手帳等級一覧 == 愛の手帳等級パターン.一度) + \
            (愛の手帳等級一覧 == 愛の手帳等級パターン.二度) + \
            (愛の手帳等級一覧 == 愛の手帳等級パターン.三度) + \
            (精神障害者保健福祉手帳等級一覧 == 精神障害者保健福祉手帳等級パターン.一級) + \
            (精神障害者保健福祉手帳等級一覧 == 精神障害者保健福祉手帳等級パターン.二級)

        年齢 = 対象世帯.members("年齢", 対象期間)
        上限年齢未満障害児童 = 対象障害者手帳等級 * (年齢 < 児童扶養手当.障害児の上限年齢)
        対象児童人数 = 対象世帯.sum(上限学年以下児童 + 上限年齢未満障害児童)

        return 対象児童人数
\`\`\`

\`\`\`python
"""
高等学校奨学給付金の実装
"""

from functools import cache

import numpy as np
from openfisca_core.indexed_enums import Enum
from openfisca_core.periods import DAY
from openfisca_core.variables import Variable
from openfisca_japan.entities import 世帯, 人物
from openfisca_japan.variables.全般 import 高校生学年


@cache
def 国立高等学校奨学給付金表():
    """
    csvファイルから値を読み込み

    国立高等学校奨学給付金表()[世帯区分, 履修形態] の形で参照可能
    """
    return np.genfromtxt("openfisca_japan/assets/福祉/育児/高等学校奨学給付金/国立高等学校奨学給付金額.csv",
                         delimiter=",", skip_header=1, dtype="int64")[:, 1:]


@cache
def 公立高等学校奨学給付金表():
    """
    csvファイルから値を読み込み

    公立高等学校奨学給付金表()[世帯区分, 履修形態] の形で参照可能
    """
    return np.genfromtxt("openfisca_japan/assets/福祉/育児/高等学校奨学給付金/公立高等学校奨学給付金額.csv",
                         delimiter=",", skip_header=1, dtype="int64")[:, 1:]


@cache
def 私立高等学校奨学給付金表():
    """
    csvファイルから値を読み込み

    私立高等学校奨学給付金表()[世帯区分, 履修形態] の形で参照可能
    """
    return np.genfromtxt("openfisca_japan/assets/福祉/育児/高等学校奨学給付金/私立高等学校奨学給付金額.csv",
                         delimiter=",", skip_header=1, dtype="int64")[:, 1:]


class 高等学校奨学給付金_最小(Variable):
    value_type = int
    entity = 世帯
    definition_period = DAY
    label = "高等学校奨学給付金"
    reference = "https://www.mext.go.jp/a_menu/shotou/mushouka/1344089.htm"
    documentation = """
    高等学校奨学給付金_最小
    (東京都HP)https://www.kyoiku.metro.tokyo.lg.jp/admission/tuition/tuition/scholarship_public_school.html
    (兵庫HP)https://web.pref.hyogo.lg.jp/kk35/shougakukyuuhukinn.html
    """

    def formula(対象世帯, 対象期間, _parameters):
        生活保護受給可能 = 対象世帯("生活保護", 対象期間) > 0
        生活保護受給世帯の高等学校奨学給付金 = \
            対象世帯.sum(対象世帯.members("生活保護受給世帯の高等学校奨学給付金", 対象期間)) * 生活保護受給可能

        住民税非課税世帯である = 対象世帯("住民税非課税世帯", 対象期間)
        住民税非課税世帯の高等学校奨学給付金 = \
            対象世帯.sum(対象世帯.members("住民税非課税世帯の高等学校奨学給付金", 対象期間)) * 住民税非課税世帯である

        # 金額が小さい方(ただし、小さい方の金額が0円の場合はもう片方を適用)
        年間支給金額 = np.select(
            [(生活保護受給世帯の高等学校奨学給付金 >= 住民税非課税世帯の高等学校奨学給付金) * 住民税非課税世帯である,
             (生活保護受給世帯の高等学校奨学給付金 < 住民税非課税世帯の高等学校奨学給付金) * 生活保護受給可能,
             住民税非課税世帯の高等学校奨学給付金 == 0,
             生活保護受給世帯の高等学校奨学給付金 == 0],
            [住民税非課税世帯の高等学校奨学給付金,
             生活保護受給世帯の高等学校奨学給付金,
             生活保護受給世帯の高等学校奨学給付金,
             住民税非課税世帯の高等学校奨学給付金],
            0)

        # 月間支給金額へ変換
        return np.floor(年間支給金額 / 12)


class 高等学校奨学給付金_最大(Variable):
    value_type = int
    entity = 世帯
    definition_period = DAY
    label = "高等学校奨学給付金"
    reference = "https://www.mext.go.jp/a_menu/shotou/mushouka/1344089.htm"
    documentation = """
    高等学校奨学給付金_最大
    (東京都HP)https://www.kyoiku.metro.tokyo.lg.jp/admission/tuition/tuition/scholarship_public_school.html
    (兵庫HP)https://web.pref.hyogo.lg.jp/kk35/shougakukyuuhukinn.html
    """

    def formula(対象世帯, 対象期間, _parameters):
        生活保護受給可能 = 対象世帯("生活保護", 対象期間) > 0
        生活保護受給世帯の高等学校奨学給付金 = \
            対象世帯.sum(対象世帯.members("生活保護受給世帯の高等学校奨学給付金", 対象期間)) * 生活保護受給可能

        住民税非課税世帯である = 対象世帯("住民税非課税世帯", 対象期間)
        住民税非課税世帯の高等学校奨学給付金 = \
            対象世帯.sum(対象世帯.members("住民税非課税世帯の高等学校奨学給付金", 対象期間)) * 住民税非課税世帯である

        # 金額が大きい方
        年間支給金額 = np.select(
            [生活保護受給世帯の高等学校奨学給付金 >= 住民税非課税世帯の高等学校奨学給付金,
             生活保護受給世帯の高等学校奨学給付金 < 住民税非課税世帯の高等学校奨学給付金],
            [生活保護受給世帯の高等学校奨学給付金,
             住民税非課税世帯の高等学校奨学給付金],
            0)

        # 月間支給金額へ変換
        return np.floor(年間支給金額 / 12)


class 生活保護受給世帯の高等学校奨学給付金(Variable):
    value_type = int
    entity = 人物
    definition_period = DAY
    label = "生活保護受給世帯の高等学校奨学給付金"
    reference = "https://www.mext.go.jp/a_menu/shotou/mushouka/1344089.htm"
    documentation = """
    生活保護受給世帯の世帯員の高等学校奨学給付金
    (東京都HP)https://www.kyoiku.metro.tokyo.lg.jp/admission/tuition/tuition/scholarship_public_school.html
    (兵庫HP)https://web.pref.hyogo.lg.jp/kk35/shougakukyuuhukinn.html
    """

    def formula(対象人物, 対象期間, parameters):
        子供である = 対象人物.has_role(世帯.子)
        高校生である = 対象人物("高校生である", 対象期間)

        高校履修種別 = 対象人物("高校履修種別", 対象期間).decode()
        高校履修種別区分 = np.select(
            [高校履修種別 == 高校履修種別パターン.全日制課程,
             高校履修種別 == 高校履修種別パターン.定時制課程,
             高校履修種別 == 高校履修種別パターン.通信制課程,
             高校履修種別 == 高校履修種別パターン.専攻科],
            [0, 1, 2, 3],
            -1).astype(int)  # intにできるようデフォルトをNoneではなく-1

        高校運営種別 = 対象人物("高校運営種別", 対象期間).decode()

        支給対象世帯区分 = 0  # 生活保護世帯に対応

        年間給付金額 = np.select(
            [高校運営種別 == 高校運営種別パターン.国立,
             高校運営種別 == 高校運営種別パターン.公立,
             高校運営種別 == 高校運営種別パターン.私立],
            [国立高等学校奨学給付金表()[支給対象世帯区分, 高校履修種別区分],
             公立高等学校奨学給付金表()[支給対象世帯区分, 高校履修種別区分],
             私立高等学校奨学給付金表()[支給対象世帯区分, 高校履修種別区分]],
            0)

        return 年間給付金額 * 高校生である * 子供である


class 住民税非課税世帯の高等学校奨学給付金(Variable):
    value_type = int
    entity = 人物
    definition_period = DAY
    label = "住民税非課税世帯の高等学校奨学給付金"
    reference = "https://www.mext.go.jp/a_menu/shotou/mushouka/1344089.htm"
    documentation = """
    住民税非課税世帯の世帯員の高等学校奨学給付金
    (東京都HP)https://www.kyoiku.metro.tokyo.lg.jp/admission/tuition/tuition/scholarship_public_school.html
    (兵庫HP)https://web.pref.hyogo.lg.jp/kk35/shougakukyuuhukinn.html
    (東京都私立財団HP)https://www.shigaku-tokyo.or.jp/pa_shougaku.html
    """

    def formula(対象人物, 対象期間, parameters):
        子供である = 対象人物.has_role(世帯.子)
        年齢 = 対象人物("年齢", 対象期間)
        支給対象である = 子供である & (年齢 < 23)
        子供の年齢降順インデックス = 対象人物.get_rank(対象人物.世帯, -年齢, condition=支給対象である)
        高校生である = 対象人物("高校生である", 対象期間)

        高校履修種別 = 対象人物("高校履修種別", 対象期間).decode()
        高校履修種別区分 = np.select(
            [高校履修種別 == 高校履修種別パターン.全日制課程,
             高校履修種別 == 高校履修種別パターン.定時制課程,
             高校履修種別 == 高校履修種別パターン.通信制課程,
             高校履修種別 == 高校履修種別パターン.専攻科],
            [0, 1, 2, 3],
            -1).astype(int)  # intにできるようデフォルトをNoneではなく-1

        高校運営種別 = 対象人物("高校運営種別", 対象期間).decode()

        通信制課程の高校に通う世帯員がいる = 対象人物.世帯("通信制課程の高校に通う世帯員がいる", 対象期間)
        # NOTE: 支給対象の範囲内の第一子か否かで区分が変わる(インデックスは0始まりのため、0は第一子を意味する)
        支給対象の範囲内の第一子である = 子供の年齢降順インデックス == 0
        第一子扱いとなる高校履修種別である = (高校履修種別 == 高校履修種別パターン.全日制課程) + (高校履修種別 == 高校履修種別パターン.定時制課程)
        支給対象世帯区分 = np.select(
            [支給対象の範囲内の第一子である * np.logical_not(通信制課程の高校に通う世帯員がいる) * 第一子扱いとなる高校履修種別である],
            [1],
            2).astype(int)

        年間給付金額 = np.select(
            [高校運営種別 == 高校運営種別パターン.国立,
             高校運営種別 == 高校運営種別パターン.公立,
             高校運営種別 == 高校運営種別パターン.私立],
            [国立高等学校奨学給付金表()[支給対象世帯区分, 高校履修種別区分],
             公立高等学校奨学給付金表()[支給対象世帯区分, 高校履修種別区分],
             私立高等学校奨学給付金表()[支給対象世帯区分, 高校履修種別区分]],
            0)

        return 年間給付金額 * 高校生である * 子供である


class 高校履修種別パターン(Enum):
    __order__ = "無 全日制課程 定時制課程 通信制課程 専攻科"
    無 = "無"
    全日制課程 = "全日制課程"
    定時制課程 = "定時制課程"
    通信制課程 = "通信制課程"
    専攻科 = "専攻科"


class 高校履修種別(Variable):
    value_type = Enum
    possible_values = 高校履修種別パターン
    default_value = 高校履修種別パターン.無
    entity = 人物
    definition_period = DAY
    label = "高校履修種別"


class 高校運営種別パターン(Enum):
    __order__ = "無 国立 公立 私立"
    無 = "無"
    国立 = "国立"
    公立 = "公立"
    私立 = "私立"


class 高校運営種別(Variable):
    value_type = Enum
    possible_values = 高校運営種別パターン
    default_value = 高校運営種別パターン.無
    entity = 人物
    definition_period = DAY
    label = "高校運営種別"


class 支給対象世帯(Enum):
    __order__ = "生活保護世帯 非課税世帯1 非課税世帯2"
    生活保護世帯 = "生活保護（生業扶助）受給世帯"
    非課税世帯1 = "非課税世帯（第1子）"
    非課税世帯2 = "非課税世帯（第2子）"


class 高校生である(Variable):
    value_type = int
    entity = 人物
    definition_period = DAY
    label = "高校生であるかどうか"

    def formula(対象人物, 対象期間, _parameters):
        学年 = 対象人物("学年", 対象期間)
        高校履修種別 = 対象人物("高校履修種別", 対象期間)
        return (学年 >= 高校生学年.一年生.value) * (学年 <= 高校生学年.三年生.value) * (高校履修種別 != 高校履修種別パターン.無)


class 通信制課程の高校に通う世帯員がいる(Variable):
    value_type = bool
    entity = 世帯
    definition_period = DAY
    label = "通信制課程の高校に通う世帯員がいる"

    def formula(対象世帯, 対象期間, _parameters):
        高校履修種別一覧 = 対象世帯.members("高校履修種別", 対象期間).decode()
        return 対象世帯.any(高校履修種別一覧 == 高校履修種別パターン.通信制課程)
\`\`\`

\`\`\`python
"""
高等学校等就学支援金の実装
"""

from functools import cache

import numpy as np
from openfisca_core.periods import DAY
from openfisca_core.variables import Variable
from openfisca_japan.entities import 世帯
from openfisca_japan.variables.全般 import 高校生学年
from openfisca_japan.variables.福祉.育児.高等学校奨学給付金 import 高校履修種別パターン, 高校運営種別パターン

# TODO: 専攻科の就学支援金についても実装する（高等学校等就学支援金制度では専攻科は対象外）

# NOTE: 項目数が多い金額表は可読性の高いCSV形式としている。


@cache
def 支給限度額_学年制表():
    """
    csvファイルから値を取得

    支給限度額_学年制表()[高校履修種別, 高校運営種別] の形で参照可能
    """
    # NOTE: 特別支援学校等、一部の高校履修種別は非対応（網羅すると判別のために利用者の入力負担が増えてしまうため）
    # https://www.mext.go.jp/a_menu/shotou/mushouka/__icsFiles/afieldfile/2020/04/30/100014428_4.pdf
    return np.genfromtxt("openfisca_japan/assets/福祉/育児/高等学校等就学支援金/支給額/支給限度額_学年制.csv",
                         delimiter=",", skip_header=1, dtype="int64")[:, 1:]


@cache
def 支給限度額_単位制表():
    """
    csvファイルから値を取得

    支給限度額_単位制表()[高校履修種別, 高校運営種別] の形で参照可能
    """
    # 月額の最大値として、年間取得可能最大単位数を取った場合の年額を12か月で按分した値を使用
    # https://www.mext.go.jp/a_menu/shotou/mushouka/__icsFiles/afieldfile/2020/04/30/100014428_4.pdf
    return np.genfromtxt("openfisca_japan/assets/福祉/育児/高等学校等就学支援金/支給額/支給限度額_単位制.csv",
                         delimiter=",", skip_header=1, dtype="int64")[:, 1:]


@cache
def 加算額_学年制表():
    """
    csvファイルから値を取得

    加算額_学年制表()[高校履修種別, 高校運営種別] の形で参照可能
    """
    return np.genfromtxt("openfisca_japan/assets/福祉/育児/高等学校等就学支援金/支給額/加算額_学年制.csv",
                         delimiter=",", skip_header=1, dtype="int64")[:, 1:]


@cache
def 加算額_単位制表():
    """
    csvファイルから値を取得

    加算額_単位制表()[高校履修種別][高校運営種別] の形で参照可能
    """
    # 月額の最大値として、年間取得可能最大単位数を取った場合の年額を12か月で按分した値を使用
    # https://www.mext.go.jp/a_menu/shotou/mushouka/__icsFiles/afieldfile/2020/04/30/100014428_4.pdf
    return np.genfromtxt("openfisca_japan/assets/福祉/育児/高等学校等就学支援金/支給額/加算額_単位制.csv",
                         delimiter=",", skip_header=1, dtype="int64")[:, 1:]


class 高等学校等就学支援金_最小(Variable):
    value_type = float
    entity = 世帯
    definition_period = DAY
    label = "高等学校等就学支援金"
    reference = "https://www.mext.go.jp/a_menu/shotou/mushouka/1342674.htm"
    documentation = """
    専攻科は対象外。
    算出方法は以下リンクも参考になる。
    (条件) https://www.mext.go.jp/a_menu/shotou/mushouka/20220329-mxt_kouhou02-3.pdf
    (金額) https://www.mext.go.jp/a_menu/shotou/mushouka/__icsFiles/afieldfile/2020/04/30/100014428_4.pdf
    """

    def formula(対象世帯, 対象期間, parameters):
        所得判定基準 = 対象世帯("高等学校等就学支援金_所得判定基準", 対象期間)
        学年 = 対象世帯.members("学年", 対象期間)
        高校生である = (学年 >= 高校生学年.一年生.value) * (学年 <= 高校生学年.三年生.value)

        高校履修種別 = 対象世帯.members("高校履修種別", 対象期間)
        高校運営種別 = 対象世帯.members("高校運営種別", 対象期間)

        高校履修種別インデックス = np.select(
            [高校履修種別 == 高校履修種別パターン.全日制課程,
             高校履修種別 == 高校履修種別パターン.定時制課程,
             高校履修種別 == 高校履修種別パターン.通信制課程],
            list(range(3)),
            -1).astype(int)

        高校運営種別インデックス = np.select(
            [高校運営種別 == 高校運営種別パターン.公立,
             高校運営種別 == 高校運営種別パターン.国立,
             高校運営種別 == 高校運営種別パターン.私立],
            list(range(3)),
            -1).astype(int)

        支給対象者である = 高校生である * (高校履修種別 != 高校履修種別パターン.無) * (高校運営種別 != 高校運営種別パターン.無)

        支給金額 = 支給限度額_学年制表()[高校履修種別インデックス, 高校運営種別インデックス]
        加算金額 = 加算額_学年制表()[高校履修種別インデックス, 高校運営種別インデックス]

        合計支給金額 = 対象世帯.sum(支給対象者である * 支給金額)
        合計加算金額 = 対象世帯.sum(支給対象者である * 加算金額)

        所得が支給対象である = 所得判定基準 < parameters(対象期間).福祉.育児.高等学校等就学支援金.所得判定基準.所得判定基準
        所得が加算対象である = 所得判定基準 < parameters(対象期間).福祉.育児.高等学校等就学支援金.所得判定基準.加算_所得判定基準

        return 合計支給金額 * 所得が支給対象である + 合計加算金額 * 所得が加算対象である


class 高等学校等就学支援金_最大(Variable):
    value_type = float
    entity = 世帯
    definition_period = DAY
    label = "高等学校等就学支援金"
    reference = "https://www.mext.go.jp/a_menu/shotou/mushouka/1342674.htm"
    documentation = """
    専攻科は対象外。
    算出方法は以下リンクも参考になる。
    (条件) https://www.mext.go.jp/a_menu/shotou/mushouka/20220329-mxt_kouhou02-3.pdf
    (金額) https://www.mext.go.jp/a_menu/shotou/mushouka/__icsFiles/afieldfile/2020/04/30/100014428_4.pdf
    """

    def formula(対象世帯, 対象期間, parameters):
        所得判定基準 = 対象世帯("高等学校等就学支援金_所得判定基準", 対象期間)
        学年 = 対象世帯.members("学年", 対象期間)
        高校生である = (学年 >= 高校生学年.一年生.value) * (学年 <= 高校生学年.三年生.value)

        高校履修種別 = 対象世帯.members("高校履修種別", 対象期間)
        高校運営種別 = 対象世帯.members("高校運営種別", 対象期間)

        高校履修種別インデックス = np.select(
            [高校履修種別 == 高校履修種別パターン.全日制課程,
             高校履修種別 == 高校履修種別パターン.定時制課程,
             高校履修種別 == 高校履修種別パターン.通信制課程],
            list(range(3)),
            -1).astype(int)

        高校運営種別インデックス = np.select(
            [高校運営種別 == 高校運営種別パターン.公立,
             高校運営種別 == 高校運営種別パターン.国立,
             高校運営種別 == 高校運営種別パターン.私立],
            list(range(3)),
            -1).astype(int)

        支給対象者である = 高校生である * (高校履修種別 != 高校履修種別パターン.無) * (高校運営種別 != 高校運営種別パターン.無)

        支給金額 = 支給限度額_単位制表()[高校履修種別インデックス, 高校運営種別インデックス]
        加算金額 = 加算額_単位制表()[高校履修種別インデックス, 高校運営種別インデックス]

        合計支給金額 = 対象世帯.sum(支給対象者である * 支給金額)
        合計加算金額 = 対象世帯.sum(支給対象者である * 加算金額)

        所得が支給対象である = 所得判定基準 < parameters(対象期間).福祉.育児.高等学校等就学支援金.所得判定基準.所得判定基準
        所得が加算対象である = 所得判定基準 < parameters(対象期間).福祉.育児.高等学校等就学支援金.所得判定基準.加算_所得判定基準

        return 合計支給金額 * 所得が支給対象である + 合計加算金額 * 所得が加算対象である


class 高等学校等就学支援金_所得判定基準(Variable):
    value_type = float
    entity = 世帯
    definition_period = DAY
    label = "高等学校等就学支援金計算において、支給額の判定基準となる額"
    reference = "https://www.mext.go.jp/a_menu/shotou/mushouka/20220329-mxt_kouhou02-3.pdf"

    def formula(対象世帯, 対象期間, parameters):
        課税標準額 = 対象世帯("控除後住民税世帯高所得", 対象期間)
        調整控除 = 対象世帯("調整控除", 対象期間)

        if 対象世帯.nb_persons(世帯.親) == 2:
            課税標準額 += 対象世帯("世帯主の配偶者の控除後住民税所得", 対象期間)
            調整控除 += 対象世帯("世帯主の配偶者の調整控除", 対象期間)

        return 課税標準額 * 0.06 - 調整控除


class 世帯主の配偶者の控除後住民税所得(Variable):
    value_type = float
    entity = 世帯
    definition_period = DAY
    label = "世帯主の配偶者の控除後住民税所得"
    reference = "https://www.town.hinode.tokyo.jp/0000000516.html"
    # TODO: 各種控除のentityが人物になったら削除
    # （世帯主が「自分」または「配偶者」でないと実際の控除額がずれるため）

    def formula(対象世帯, 対象期間, parameters):
        # 所得が高いほうが控除を受ける対象となる
        所得一覧 = 対象世帯.members("所得", 対象期間)
        所得降順 = 対象世帯.get_rank(対象世帯, - 所得一覧, condition=対象世帯.has_role(世帯.親))
        納税者の配偶者である = 所得降順 == 1
        納税者の配偶者の所得 = 対象世帯.sum(所得一覧 * 納税者の配偶者である)

        # 扶養等と関係のない、納税者全員に関わる控除を追加
        # TODO: 世帯高所得ではなく自分、配偶者それぞれの所得から控除額を算出
        基礎控除 = np.select(
            [納税者の配偶者の所得 <= 24000000,
             納税者の配偶者の所得 > 24000000 and 納税者の配偶者の所得 <= 24500000,
             納税者の配偶者の所得 > 24500000 and 納税者の配偶者の所得 <= 25000000],
            [430000,
             290000,
             150000],
            0)

        # 他の控除（雑損控除・医療費控除等）は定額でなく実費を元に算出するため除外する
        総控除額 = 基礎控除

        # 負の数にならないよう、0円未満になった場合は0円に補正
        return np.clip(納税者の配偶者の所得 - 総控除額, 0.0, None)


class 世帯主の配偶者の人的控除額の差(Variable):
    value_type = float
    entity = 世帯
    definition_period = DAY
    label = "世帯主の配偶者に対する所得税と住民税の控除の差額"
    reference = "https://www.town.hinode.tokyo.jp/0000000516.html"
    # TODO: 各種控除のentityが人物になったら削除
    # （世帯主が「自分」または「配偶者」でないと実際の額とずれるため）

    def formula(対象世帯, 対象期間, parameters):
        # 所得が高いほうが控除を受ける対象となる
        所得一覧 = 対象世帯.members("所得", 対象期間)
        所得降順 = 対象世帯.get_rank(対象世帯, - 所得一覧, condition=対象世帯.has_role(世帯.親))
        納税者の配偶者である = 所得降順 == 1
        納税者の配偶者の所得 = 対象世帯.sum(所得一覧 * 納税者の配偶者である)

        基礎控除差額 = np.where(納税者の配偶者の所得 <= 25000000, 50000, 0)

        return 基礎控除差額


class 世帯主の配偶者の調整控除(Variable):
    value_type = float
    entity = 世帯
    definition_period = DAY
    label = "世帯主の配偶者の調整控除"
    reference = "https://money-bu-jpx.com/news/article043882/"
    # TODO: 各種控除のentityが人物になったら削除
    # （世帯主が「自分」または「配偶者」でないと実際の額とずれるため）

    def formula(対象世帯, 対象期間, _parameters):
        人的控除額の差 = 対象世帯("世帯主の配偶者の人的控除額の差", 対象期間)

        # 個人住民税の課税所得金額に相当
        控除後住民税世帯高所得 = 対象世帯("世帯主の配偶者の控除後住民税所得", 対象期間)

        控除額 = np.select(
            [控除後住民税世帯高所得 <= 2000000,
             (控除後住民税世帯高所得 > 2000000) * (控除後住民税世帯高所得 < 25000000)],
            # (noqa) np.maxを世帯員抽出ではなく2つの式の比較に使用しているためlinterを許容
            [np.min([控除後住民税世帯高所得, 人的控除額の差], axis=0) * 0.05,  # noqa: TID251
             (人的控除額の差 - (控除後住民税世帯高所得 - 2000000)) * 0.05],
            0)

        # 負の数にならないよう、0円未満になった場合は0円に補正
        return np.clip(控除額, 0.0, None)
\`\`\`

\`\`\`python
"""
ひとり親の実装
"""

from openfisca_core.periods import DAY
from openfisca_core.variables import Variable
from openfisca_japan.entities import 世帯, 人物


class 配偶者がいるがひとり親に該当(Variable):
    value_type = bool
    default_value = False
    entity = 世帯
    definition_period = DAY
    label = "配偶者がいるがひとり親に該当"


class ひとり親(Variable):
    value_type = bool
    entity = 世帯
    definition_period = DAY
    label = "ひとり親に該当するか否か"
    reference = "https://www.city.shibuya.tokyo.jp/kodomo/teate/hitorioya/hitorioya_teate.html"
    documentation = """
    渋谷区の児童扶養手当制度

    - 〒150-8010 東京都渋谷区宇田川町1-1
    - 渋谷区子ども青少年課子育て給付係
    - 03-3463-2558
    """

    def formula(対象世帯, 対象期間, parameters):
        配偶者がいない = 対象世帯.nb_persons(世帯.親) == 1

        return 配偶者がいない + 対象世帯("配偶者がいるがひとり親に該当", 対象期間)


class 夫と離別死別(Variable):
    value_type = bool
    default_value = False
    entity = 世帯
    definition_period = DAY
    label = "夫と離別・死別しているか否か"
    reference = "https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1170.htm"


class 寡婦(Variable):
    value_type = bool
    entity = 人物
    definition_period = DAY
    label = "寡婦に該当するか否か"
    reference = "https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1170.htm"

    def formula(対象人物, 対象期間, _parameters):
        子供がいない = 対象人物.世帯.sum(対象人物.has_role(世帯.子)) == 0
        親である = 対象人物.has_role(世帯.親)
        return 子供がいない * 親である * 対象人物.世帯("夫と離別死別", 対象期間)
\`\`\`

\`\`\`python
"""
特別児童扶養手当の実装
"""

import numpy as np
from openfisca_core.periods import DAY
from openfisca_core.variables import Variable
from openfisca_japan.entities import 世帯
from openfisca_japan.variables.障害.内部障害 import 内部障害パターン
from openfisca_japan.variables.障害.愛の手帳 import 愛の手帳等級パターン
from openfisca_japan.variables.障害.療育手帳 import 療育手帳等級パターン
from openfisca_japan.variables.障害.精神障害者保健福祉手帳 import 精神障害者保健福祉手帳等級パターン
from openfisca_japan.variables.障害.身体障害者手帳 import 身体障害者手帳等級パターン


class 特別児童扶養手当_最大(Variable):
    value_type = int
    entity = 世帯
    definition_period = DAY
    label = "保護者への特別児童扶養手当の最大額"
    reference = "https://www.mhlw.go.jp/bunya/shougaihoken/jidou/huyou.html"
    documentation = """
    特別児童扶養手当制度
    """

    def formula(対象世帯, 対象期間, parameters):
        特別児童扶養手当 = parameters(対象期間).福祉.育児.特別児童扶養手当

        身体障害者手帳等級一覧 = 対象世帯.members("身体障害者手帳等級", 対象期間)
        療育手帳等級一覧 = 対象世帯.members("療育手帳等級", 対象期間)
        愛の手帳等級一覧 = 対象世帯.members("愛の手帳等級", 対象期間)
        精神障害者保健福祉手帳等級一覧 = 対象世帯.members("精神障害者保健福祉手帳等級", 対象期間)
        内部障害一覧 = 対象世帯.members("内部障害", 対象期間)
        年齢 = 対象世帯.members("年齢", 対象期間)
        児童である = 対象世帯.has_role(世帯.子)
        上限年齢未満の児童 = 児童である * (年齢 < 特別児童扶養手当.上限年齢)

        # 精神障害者保健福祉手帳の等級は以下の中標津町のHPを参照
        # https://www.nakashibetsu.jp/kurashi/kosodate_fukushi/shougaisha/teate/tokubetujidou/
        # 内部障害は対象になる場合とならない場合があるため最大額の対象には含める
        対象障害者手帳等級 = \
            (身体障害者手帳等級一覧 == 身体障害者手帳等級パターン.一級) + \
            (身体障害者手帳等級一覧 == 身体障害者手帳等級パターン.二級) + \
            (身体障害者手帳等級一覧 == 身体障害者手帳等級パターン.三級) + \
            (療育手帳等級一覧 == 療育手帳等級パターン.A) + \
            (療育手帳等級一覧 == 療育手帳等級パターン.B) + \
            (愛の手帳等級一覧 == 愛の手帳等級パターン.一度) + \
            (愛の手帳等級一覧 == 愛の手帳等級パターン.二度) + \
            (愛の手帳等級一覧 == 愛の手帳等級パターン.三度) + \
            (精神障害者保健福祉手帳等級一覧 == 精神障害者保健福祉手帳等級パターン.一級) + \
            (精神障害者保健福祉手帳等級一覧 == 精神障害者保健福祉手帳等級パターン.二級) + \
            (内部障害一覧 == 内部障害パターン.有)

        対象児童人数 = 対象世帯.sum(上限年齢未満の児童 & 対象障害者手帳等級)

        手当条件 = 対象世帯("特別児童扶養手当の所得条件", 対象期間)
        手当金額 = 対象児童人数 * 特別児童扶養手当.金額.一級

        # TODO 障がいを事由とする公的年金を受けているときは対象にならない

        return 手当条件 * 手当金額


class 特別児童扶養手当_最小(Variable):
    value_type = int
    entity = 世帯
    definition_period = DAY
    label = "保護者への特別児童扶養手当の最小額"
    reference = "https://www.mhlw.go.jp/bunya/shougaihoken/jidou/huyou.html"
    documentation = """
    特別児童扶養手当制度
    """

    def formula(対象世帯, 対象期間, parameters):
        特別児童扶養手当 = parameters(対象期間).福祉.育児.特別児童扶養手当

        身体障害者手帳等級一覧 = 対象世帯.members("身体障害者手帳等級", 対象期間)
        療育手帳等級一覧 = 対象世帯.members("療育手帳等級", 対象期間)
        愛の手帳等級一覧 = 対象世帯.members("愛の手帳等級", 対象期間)
        精神障害者保健福祉手帳等級一覧 = 対象世帯.members("精神障害者保健福祉手帳等級", 対象期間)
        年齢 = 対象世帯.members("年齢", 対象期間)
        児童である = 対象世帯.has_role(世帯.子)
        上限年齢未満の児童 = 児童である * (年齢 < 特別児童扶養手当.上限年齢)

        # 精神障害者保健福祉手帳の等級は以下の中標津町のHPを参照
        # https://www.nakashibetsu.jp/kurashi/kosodate_fukushi/shougaisha/teate/tokubetujidou/
        # 内部障害は対象になる場合とならない場合があるため最小額の対象には含めない
        対象障害者手帳等級 = \
            (身体障害者手帳等級一覧 == 身体障害者手帳等級パターン.一級) + \
            (身体障害者手帳等級一覧 == 身体障害者手帳等級パターン.二級) + \
            (身体障害者手帳等級一覧 == 身体障害者手帳等級パターン.三級) + \
            (療育手帳等級一覧 == 療育手帳等級パターン.A) + \
            (療育手帳等級一覧 == 療育手帳等級パターン.B) + \
            (愛の手帳等級一覧 == 愛の手帳等級パターン.一度) + \
            (愛の手帳等級一覧 == 愛の手帳等級パターン.二度) + \
            (愛の手帳等級一覧 == 愛の手帳等級パターン.三度) + \
            (精神障害者保健福祉手帳等級一覧 == 精神障害者保健福祉手帳等級パターン.一級) + \
            (精神障害者保健福祉手帳等級一覧 == 精神障害者保健福祉手帳等級パターン.二級)

        対象児童人数 = 対象世帯.sum(上限年齢未満の児童 * 対象障害者手帳等級)

        手当条件 = 対象世帯("特別児童扶養手当の所得条件", 対象期間)
        手当金額 = 対象児童人数 * 特別児童扶養手当.金額.二級

        # TODO 障がいを事由とする公的年金を受けているときは対象にならない

        return 手当条件 * 手当金額


class 特別児童扶養手当の所得条件(Variable):
    value_type = bool
    entity = 世帯
    definition_period = DAY
    label = "保護者への特別児童扶養手当の所得条件"
    reference = "https://www.mhlw.go.jp/bunya/shougaihoken/jidou/huyou.html"
    documentation = """
    特別児童扶養手当制度
    """

    def formula(対象世帯, 対象期間, parameters):
        特別児童扶養手当 = parameters(対象期間).福祉.育児.特別児童扶養手当

        # 世帯で最も高い所得の人が基準となる
        世帯高所得 = 対象世帯("特別児童扶養手当の控除後世帯高所得", 対象期間)
        扶養人数 = 対象世帯("扶養人数", 対象期間)

        # 所得制限限度額の「扶養義務者」は、父または母か養育者が扶養義務者でない場合
        # 参考：厚労省HP (https://www.mhlw.go.jp/bunya/shougaihoken/jidou/huyou.html)
        # NOTE: 直接 \`受給者[扶養人数]\` のように要素参照すると型が合わず複数世帯の場合に計算できないためnp.selectを使用
        所得制限限度額 = np.select(
            [扶養人数 == i for i in range(10)],
            [特別児童扶養手当.所得制限限度額.受給者[i] for i in range(10)],
            -1).astype(int)

        # TODO: 所得税控除を世帯員ごとに計算できるようになったら以下のように修正
        # 児童扶養手当 = 対象世帯("児童扶養手当", 対象期間)
        # 所得制限限度額 = np.select(
        #    [児童扶養手当 <= 0, 0 < 児童扶養手当],
        #    [
        #        特別児童扶養手当.所得制限限度額.児童扶養手当受給者[扶養人数],
        #        特別児童扶養手当.所得制限限度額.扶養義務者[扶養人数],
        #    ],
        #    )
        所得条件 = 世帯高所得 < 所得制限限度額

        return 所得条件
\`\`\`

\`\`\`python
"""
児童手当の実装
"""

import numpy as np
from openfisca_core.periods import DAY
from openfisca_core.variables import Variable
from openfisca_japan.entities import 世帯
from openfisca_japan.variables.全般 import 中学生学年, 小学生学年, 高校生学年


class 児童手当(Variable):
    value_type = float
    entity = 世帯
    definition_period = DAY
    label = "保護者への児童手当"
    reference = "https://www.cfa.go.jp/policies/kokoseido/jidouteate/annai/"
    documentation = """
    児童手当制度
    """

    def formula(対象世帯, 対象期間, parameters):
        児童手当 = parameters(対象期間).福祉.育児.児童手当

        年齢 = 対象世帯.members("年齢", 対象期間)
        学年 = 対象世帯.members("学年", 対象期間)

        # 児童手当金額(特例給付でない)

        高校生以下である = 対象世帯.has_role(世帯.子) * (学年 <= 高校生学年.三年生.value) * (年齢 <= 18)
        # 高校生以下でない場合は -1 が入る
        高校生以下の出生順 = 対象世帯.get_rank(対象世帯, - 年齢, condition=高校生以下である)

        三歳未満である = 年齢 < 3
        # テストで学年が入力されていない場合は学年に0が入るため、年齢で大人を除外する
        三歳から小学校修了前である = (年齢 >= 3) * (学年 <= 小学生学年.六年生.value) * (年齢 <= 12)
        三歳から小学校修了前かつ第二子以前である = 三歳から小学校修了前である * (高校生以下の出生順 >= 0) * (高校生以下の出生順 < 2)
        三歳から小学校修了前かつ第三子以降である = 三歳から小学校修了前である * (高校生以下の出生順 >= 2)
        中学生である = (学年 >= 中学生学年.一年生.value) * (学年 <= 中学生学年.三年生.value)

        児童手当金額 = 対象世帯.sum(三歳未満である * 児童手当.金額.三歳未満
                          + 三歳から小学校修了前かつ第二子以前である * 児童手当.金額.三歳から小学校修了前かつ第二子以前
                          + 三歳から小学校修了前かつ第三子以降である * 児童手当.金額.三歳から小学校修了前かつ第三子以降
                          + 中学生である * 児童手当.金額.中学生)

        # 特例給付金額
        中学生以下である = (学年 <= 中学生学年.三年生.value) * (年齢 <= 15)
        特例給付金額 = 対象世帯.sum(中学生以下である * 児童手当.金額.特例給付)

        # 所得条件
        # 世帯で最も高い所得の人が基準となる  TODO: このformulaの中で対象となる控除を差し引く
        世帯高所得 = 対象世帯("児童手当の控除後世帯高所得", 対象期間)
        扶養人数 = 対象世帯("扶養人数", 対象期間)
        所得制限限度額 = np.array(児童手当.所得制限限度額)[扶養人数]  # 複数世帯入力(2以上の長さのndarray入力)対応のためndarray化
        所得上限限度額 = np.array(児童手当.所得上限限度額)[扶養人数]
        児童手当所得条件 = 世帯高所得 < 所得制限限度額
        特例給付所得条件 = (世帯高所得 >= 所得制限限度額) * (世帯高所得 < 所得上限限度額)

        return 児童手当所得条件 * 児童手当金額 + 特例給付所得条件 * 特例給付金額
\`\`\`

\`\`\`python
"""
生活保護の実装
"""

import csv
from functools import cache
import json

import numpy as np
from openfisca_core.indexed_enums import Enum
from openfisca_core.periods import DAY
from openfisca_core.variables import Variable
from openfisca_japan.entities import 世帯, 人物
from openfisca_japan.variables.障害.身体障害者手帳 import 身体障害者手帳等級パターン


# NOTE: 各種基準額表は項目数が多いため可読性の高いCSV形式やjson形式としている。
# https://www.mhlw.go.jp/content/000776372.pdf を参照


@cache
def 生活扶助基準1_第1類_基準額1表():
    """
    csvファイルから値を読み込み

    生活扶助基準1_第1類_基準額1表()[年齢, 居住級地区分] の形で参照可能
    """
    return np.genfromtxt("openfisca_japan/assets/福祉/生活保護/生活扶助基準額/第1類1.csv",
                         delimiter=",", skip_header=1, dtype="int64")[:, 1:]


@cache
def 生活扶助基準1_逓減率1表():
    """
    csvファイルから値を読み込み

    生活扶助基準1_逓減率1表()[世帯人数, 居住級地区分] の形で参照可能
    """
    return np.genfromtxt("openfisca_japan/assets/福祉/生活保護/生活扶助基準額/逓減率1.csv",
                         delimiter=",", skip_header=1, dtype="float64")[:, 1:]


@cache
def 生活扶助基準1_第2類_基準額1表():
    """
    csvファイルから値を読み込み

    生活扶助基準1_第2類_基準額1表()[世帯人数, 居住級地区分] の形で参照可能
    """
    return np.genfromtxt("openfisca_japan/assets/福祉/生活保護/生活扶助基準額/第2類1.csv",
                        delimiter=",", skip_header=1, dtype="int64")[:, 1:]


@cache
def 生活扶助基準2_第1類_基準額2表():
    """
    csvファイルから値を読み込み

    生活扶助基準2_第1類_基準額2表()[年齢, 居住級地区分] の形で参照可能
    """
    return np.genfromtxt("openfisca_japan/assets/福祉/生活保護/生活扶助基準額/第1類2.csv",
                         delimiter=",", skip_header=1, dtype="int64")[:, 1:]


@cache
def 生活扶助基準2_逓減率2表():
    """
    csvファイルから値を読み込み

    生活扶助基準2_逓減率2表()[世帯人数, 居住級地区分] の形で参照可能
    """
    return np.genfromtxt("openfisca_japan/assets/福祉/生活保護/生活扶助基準額/逓減率2.csv",
                         delimiter=",", skip_header=1, dtype="float64")[:, 1:]


@cache
def 生活扶助基準2_第2類_基準額2表():
    """
    csvファイルから値を読み込み

    生活扶助基準2_第2類_基準額2表()[世帯人数, 居住級地区分] の形で参照可能
    """
    return np.genfromtxt("openfisca_japan/assets/福祉/生活保護/生活扶助基準額/第2類2.csv",
                         delimiter=",", skip_header=1, dtype="int64")[:, 1:]


@cache
def 地域区分表():
    """
    jsonファイルから値を読み込み

    地域区分表()[都道府県] の形で参照可能
    票に含まれていないものはすべて6区
    """
    with open("openfisca_japan/assets/福祉/生活保護/冬季加算/地域区分.json") as f:
        d = json.load(f)
        return np.array(list(d.values()))


@cache
def 地域区分表_キー一覧():
    """
    jsonファイルから値を読み込み

    selectする際のキー一覧として都道府県名を取得
    """
    with open("openfisca_japan/assets/福祉/生活保護/冬季加算/地域区分.json") as f:
        d = json.load(f)
        return d.keys()


@cache
def 冬季加算表():
    """
    csvファイルから値を読み込み

    冬季加算表()[冬季加算地域区分, 世帯人数, 居住級地区分] の形で参照可能
    """
    冬季加算表 = []
    for i in range(1, 7):
        地域区分の冬季加算表 = np.genfromtxt(f"openfisca_japan/assets/福祉/生活保護/冬季加算/{i}区.csv",
                                   delimiter=",", skip_header=1, dtype="int64")[:, 1:]
        冬季加算表.append(地域区分の冬季加算表)
    return np.stack(冬季加算表)


@cache
def 市ごとの住宅扶助限度額():
    """
    csvファイルから値を読み込み

    市ごとの住宅扶助限度額()[市, 世帯人員] の形で参照可能
    """
    return np.genfromtxt("openfisca_japan/assets/福祉/生活保護/住宅扶助基準額/市.csv",
                         delimiter=",", skip_header=1, dtype="int64")[:, 1:]


@cache
def 市ごとの住宅扶助限度額_キー一覧():
    """
    csvファイルから値を読み込み

    selectする際のキー一覧として市名を取得
    """
    with open("openfisca_japan/assets/福祉/生活保護/住宅扶助基準額/市.csv") as f:
        reader = csv.DictReader(f)
        return [row["市"] for row in reader]


@cache
def 都道府県ごとの住宅扶助限度額():
    """
    csvファイルから値を読み込み

    都道府県ごとの住宅扶助限度額()[都道府県区分, 世帯人員] の形で参照可能
    """
    return np.genfromtxt("openfisca_japan/assets/福祉/生活保護/住宅扶助基準額/都道府県.csv",
                         delimiter=",", skip_header=1, dtype="int64")[:, 2:]


@cache
def 都道府県ごとの住宅扶助限度額_キー一覧():
    """
    csvファイルから値を読み込み

    selectする際のキー一覧として都道府県名、級地区分を取得
    """
    with open("openfisca_japan/assets/福祉/生活保護/住宅扶助基準額/都道府県.csv") as f:
        reader = csv.DictReader(f)
        return [{"都道府県": row["都道府県"], "級地": int(row["級地"])} for row in reader]


@cache
def 生活扶助本体に係る経過的加算表():
    """
    csvファイルから値を読み込み

    生活扶助本体に係る経過的加算表()[世帯人数, 年齢, 居住級地区分1] の形で参照可能
    """
    生活扶助本体に係る経過的加算表 = []
    for i in range(1, 6):
        生活扶助本体に係る経過的加算表.append(np.genfromtxt(f"openfisca_japan/assets/福祉/生活保護/生活扶助本体に係る経過的加算/{i}人世帯.csv",
                                         delimiter=",", skip_header=1, dtype="int64")[:, 1:])
    return np.stack(生活扶助本体に係る経過的加算表)


@cache
def 母子世帯等に係る経過的加算表():
    """
    csvファイルから値を読み込み

    母子世帯等に係る経過的加算表()[世帯人数, 年齢, 居住級地区分] の形で参照可能
    """
    母子世帯等に係る経過的加算表 = []

    母子世帯等に係る経過的加算表.append(np.genfromtxt("openfisca_japan/assets/福祉/生活保護/母子世帯等に係る経過的加算/3人世帯.csv",
                                     delimiter=",", skip_header=1, dtype="int64")[:, 1:])
    母子世帯等に係る経過的加算表.append(np.genfromtxt("openfisca_japan/assets/福祉/生活保護/母子世帯等に係る経過的加算/4人世帯.csv",
                                     delimiter=",", skip_header=1, dtype="int64")[:, 1:])
    母子世帯等に係る経過的加算表.append(np.genfromtxt("openfisca_japan/assets/福祉/生活保護/母子世帯等に係る経過的加算/5人世帯.csv",
                                     delimiter=",", skip_header=1, dtype="int64")[:, 1:])

    return np.stack(母子世帯等に係る経過的加算表)


@cache
def 障害者加算表():
    """
    csvファイルから値を読み込み

    障害者加算表()[等級, 居住級地区分1] の形で参照可能
    """
    return np.genfromtxt("openfisca_japan/assets/福祉/生活保護/障害者加算.csv",
                         delimiter=",", skip_header=1, dtype="int64")[:, 1:]


@cache
def 期末一時扶助表():
    """
    csvファイルから値を読み込み

    期末一時扶助表()[世帯人数, 居住級地区分] の形で参照可能
    """
    return np.genfromtxt("openfisca_japan/assets/福祉/生活保護/期末一時扶助.csv",
                         delimiter=",", skip_header=1, dtype="int64")[:, 1:]


class 生活保護(Variable):
    value_type = float
    entity = 世帯
    definition_period = DAY
    label = "生活保護"
    reference = "https://www.mhlw.go.jp/content/000776372.pdf"
    documentation = """
    算出方法は以下リンクも参考になる。
    https://www.mhlw.go.jp/content/12002000/000771098.pdf
    https://www.holos.jp/media/welfare-amount-of-money.php
    https://www.wam.go.jp/wamappl/bb16GS70.nsf/0/573310120867b50d4925743c00047cb4/$FILE/20080501_1shiryou5_1.pdf
    """

    def formula(対象世帯, 対象期間, parameters):
        # 以下、必要なvariableを作成する。
        # 細かく作成した方が単体テストの数が少なくなるため楽。
        # 組み合わせたvariableは条件も組み合わせてテストするためテスト数が多くなる。

        # 【Ａ】 (「生活扶助基準（第１類＋第２類）①×0.855」又は「生活扶助基準（第１類＋第２類）②」のいずれか高い方)＋生活扶助本体に係る経過的加算
        生活扶助基準1 = 対象世帯("生活扶助基準1", 対象期間)
        生活扶助基準2 = 対象世帯("生活扶助基準2", 対象期間)
        生活扶助本体に係る経過的加算 = 対象世帯("生活扶助本体に係る経過的加算", 対象期間)
        # (noqa) np.maxを世帯員抽出ではなく2つの式の比較に使用しているためlinterを許容
        # NOTE: 世帯ごとの最大値を取得するため、axisの指定が必要（指定しないとすべての要素の最大値を返してしまう）
        a = np.max([生活扶助基準1 * 0.855, 生活扶助基準2], axis=0) + 生活扶助本体に係る経過的加算  # noqa: TID251

        # 【Ｂ】加算
        障害者加算 = 対象世帯("障害者加算", 対象期間)
        母子加算 = 対象世帯("母子加算", 対象期間)
        児童を養育する場合の加算 = 対象世帯("児童を養育する場合の加算", 対象期間)
        母子世帯等に係る経過的加算 = 対象世帯("母子世帯等に係る経過的加算", 対象期間)
        児童を養育する場合に係る経過的加算 = 対象世帯("児童を養育する場合に係る経過的加算", 対象期間)
        放射線障害者加算 = 対象世帯("放射線障害者加算", 対象期間)
        妊産婦加算 = 対象世帯("妊産婦加算", 対象期間)
        介護施設入所者加算 = 対象世帯("介護施設入所者加算", 対象期間)
        在宅患者加算 = 対象世帯("在宅患者加算", 対象期間)

        # 障害者加算と母子加算は併給できない（参考：https://www.mhlw.go.jp/content/000776372.pdf）
        # 高い方のみ加算（参考：https://www.ace-room.jp/safetynet/safetyqa/safety-add/）
        # (noqa) np.maxを世帯員抽出ではなく2つの式の比較に使用しているためlinterを許容
        # NOTE: 世帯ごとの最大値を取得するため、axisの指定が必要（指定しないとすべての要素の最大値を返してしまう）
        b = np.max([障害者加算, 母子加算], axis=0) + 児童を養育する場合の加算 + 母子世帯等に係る経過的加算 + 児童を養育する場合に係る経過的加算 + \
            放射線障害者加算 + 妊産婦加算 + 介護施設入所者加算 + 在宅患者加算  # noqa: TID251

        # 【Ｃ】住宅扶助基準
        住宅扶助基準 = 対象世帯("住宅扶助基準", 対象期間)
        c = 住宅扶助基準

        # 【Ｄ】教育扶助基準、高等学校等就学費
        教育扶助基準 = 対象世帯("教育扶助基準", 対象期間)
        高等学校等就学費 = 対象世帯("高等学校等就学費", 対象期間)
        d = 教育扶助基準 + 高等学校等就学費

        # NOTE: 介護費・医療費等その他の加算・扶助は実費のため計算せず、計算結果GUIの説明欄に記載
        # 【Ｅ】介護扶助基準
        e = 0.0
        # 【Ｆ】医療扶助基準
        f = 0.0

        期末一時扶助 = 対象世帯("期末一時扶助", 対象期間)

        # 以上のステップで出した最低生活費から月収と各種手当額を引いた額が給付される
        # 参考: https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/hukushi_kaigo/seikatsuhogo/seikatuhogo/index.html
        最低生活費 = a + b + c + d + e + f + 期末一時扶助
        収入 = 対象世帯.sum(対象世帯.members("収入", 対象期間))
        # 就労収入のうち一定額を控除
        勤労控除 = 対象世帯("勤労控除", 対象期間)
        月収 = np.clip(収入 / 12 - 勤労控除, 0, None)

        # TODO: 実装される手当てが増えるたびに追記しなくてもよい仕組みが必要？
        各種手当額 = 対象世帯("児童手当", 対象期間) + 対象世帯("児童育成手当", 対象期間) + 対象世帯("児童扶養手当_最小", 対象期間)

        # 負の数にならないよう、0円未満になった場合は0円に補正
        return np.clip(最低生活費 - 月収 - 各種手当額, 0.0, None)


class 生活扶助基準1(Variable):
    value_type = float
    entity = 世帯
    definition_period = DAY
    label = "生活扶助基準（第1類+第2類）①"
    reference = "https://www.mhlw.go.jp/content/000776372.pdf"
    documentation = """
    算出方法は以下リンクも参考になる。
    https://www.mhlw.go.jp/content/12002000/000771098.pdf
    https://www.holos.jp/media/welfare-amount-of-money.php
    https://www.wam.go.jp/wamappl/bb16GS70.nsf/0/573310120867b50d4925743c00047cb4/$FILE/20080501_1shiryou5_1.pdf
    """

    def formula(対象世帯, 対象期間, parameters):
        生活扶助基準1_第1類_基準額1 = 対象世帯("生活扶助基準1_第1類_基準額1", 対象期間)
        生活扶助基準1_逓減率1 = 対象世帯("生活扶助基準1_逓減率1", 対象期間)
        生活扶助基準1_第2類_基準額1 = 対象世帯("生活扶助基準1_第2類_基準額1", 対象期間)
        冬季加算 = 対象世帯("冬季加算", 対象期間)

        return 生活扶助基準1_第1類_基準額1 * 生活扶助基準1_逓減率1 + 生活扶助基準1_第2類_基準額1 + 冬季加算


class 生活扶助基準1_第1類_基準額1(Variable):
    value_type = float
    entity = 世帯
    definition_period = DAY
    label = "生活扶助基準(第1類) 基準額1"
    reference = "https://www.mhlw.go.jp/content/000776372.pdf"
    documentation = """
    算出方法は以下リンクも参考になる。
    https://www.mhlw.go.jp/content/12002000/000771098.pdf
    https://www.holos.jp/media/welfare-amount-of-money.php
    https://www.wam.go.jp/wamappl/bb16GS70.nsf/0/573310120867b50d4925743c00047cb4/$FILE/20080501_1shiryou5_1.pdf
    """

    def formula(対象世帯, 対象期間, _parameters):
        # NOTE: 世帯で計算すると配列のサイズが合わずエラーになるため、人物ごとに計算
        各世帯員の基準額 = 対象世帯.members("生活扶助基準1_第1類_基準額1_世帯員", 対象期間)
        return 対象世帯.sum(各世帯員の基準額)


class 生活扶助基準1_第1類_基準額1_世帯員(Variable):
    value_type = float
    entity = 人物
    definition_period = DAY
    label = "生活扶助基準(第1類) 基準額1"
    reference = "https://www.mhlw.go.jp/content/000776372.pdf"
    documentation = """
    算出方法は以下リンクも参考になる。
    https://www.mhlw.go.jp/content/12002000/000771098.pdf
    https://www.holos.jp/media/welfare-amount-of-money.php
    https://www.wam.go.jp/wamappl/bb16GS70.nsf/0/573310120867b50d4925743c00047cb4/$FILE/20080501_1shiryou5_1.pdf
    """

    def formula(対象人物, 対象期間, _parameters):
        居住級地区分1 = 対象人物.世帯("居住級地区分1", 対象期間)
        居住級地区分2 = 対象人物.世帯("居住級地区分2", 対象期間)
        居住級地区分インデックス = np.select(
            [(居住級地区分1 == 1) * (居住級地区分2 == 1),
             (居住級地区分1 == 1) * (居住級地区分2 == 2),
             (居住級地区分1 == 2) * (居住級地区分2 == 1),
             (居住級地区分1 == 2) * (居住級地区分2 == 2),
             (居住級地区分1 == 3) * (居住級地区分2 == 1),
             (居住級地区分1 == 3) * (居住級地区分2 == 2)],
            list(range(6)),
            -1).astype(int)

        年齢 = 対象人物("年齢", 対象期間)
        年齢区分インデックス = np.select(
            [(年齢 >= 0) * (年齢 <= 2),
             (年齢 >= 3) * (年齢 <= 5),
             (年齢 >= 6) * (年齢 <= 11),
             (年齢 >= 12) * (年齢 <= 17),
             (年齢 >= 18) * (年齢 <= 19),
             (年齢 >= 20) * (年齢 <= 40),
             (年齢 >= 41) * (年齢 <= 59),
             (年齢 >= 60) * (年齢 <= 64),
             (年齢 >= 65) * (年齢 <= 69),
             (年齢 >= 70) * (年齢 <= 74),
             年齢 >= 75],
            list(range(11)),
            -1).astype(int)

        # NOTE: この行はentityを人物にして計算する必要がある
        # (世帯の場合、年齢区分の要素数が人物、居住級地区分の要素数が世帯となり配列の形式が一致せずエラーになる)
        各世帯員の基準額 = 生活扶助基準1_第1類_基準額1表()[年齢区分インデックス, 居住級地区分インデックス]

        return 各世帯員の基準額


class 生活扶助基準1_逓減率1(Variable):
    value_type = float
    entity = 世帯
    definition_period = DAY
    label = "生活扶助基準 逓減率1"
    reference = "https://www.mhlw.go.jp/content/000776372.pdf"
    documentation = """
    算出方法は以下リンクも参考になる。
    https://www.mhlw.go.jp/content/12002000/000771098.pdf
    https://www.holos.jp/media/welfare-amount-of-money.php
    https://www.wam.go.jp/wamappl/bb16GS70.nsf/0/573310120867b50d4925743c00047cb4/$FILE/20080501_1shiryou5_1.pdf
    """

    def formula(対象世帯, 対象期間, parameters):
        居住級地区分1 = 対象世帯("居住級地区分1", 対象期間)
        居住級地区分2 = 対象世帯("居住級地区分2", 対象期間)
        居住級地区分インデックス = np.select(
            [(居住級地区分1 == 1) * (居住級地区分2 == 1),
             (居住級地区分1 == 1) * (居住級地区分2 == 2),
             (居住級地区分1 == 2) * (居住級地区分2 == 1),
             (居住級地区分1 == 2) * (居住級地区分2 == 2),
             (居住級地区分1 == 3) * (居住級地区分2 == 1),
             (居住級地区分1 == 3) * (居住級地区分2 == 2)],
            list(range(6)),
            -1).astype(int)

        世帯人数 = 対象世帯("世帯人数", 対象期間)
        # 入院患者、施設入所者は世帯人数に含めない
        入院中 = 対象世帯.members("入院中", 対象期間)
        介護施設入所中 = 対象世帯.members("介護施設入所中", 対象期間)
        世帯人数 = 対象世帯.sum(np.logical_not(入院中) * np.logical_not(介護施設入所中))
        # インデックスは0始まりなので1を引いて調整
        世帯人数区分インデックス = np.clip(世帯人数 - 1, 0, 4).astype(int)

        return 生活扶助基準1_逓減率1表()[世帯人数区分インデックス, 居住級地区分インデックス]


class 生活扶助基準1_第2類_基準額1(Variable):
    value_type = float
    entity = 世帯
    definition_period = DAY
    label = "生活扶助基準(第2類) 基準額1"
    reference = "https://www.mhlw.go.jp/content/000776372.pdf"
    documentation = """
    算出方法は以下リンクも参考になる。
    https://www.mhlw.go.jp/content/12002000/000771098.pdf
    https://www.holos.jp/media/welfare-amount-of-money.php
    https://www.wam.go.jp/wamappl/bb16GS70.nsf/0/573310120867b50d4925743c00047cb4/$FILE/20080501_1shiryou5_1.pdf
    """

    def formula(対象世帯, 対象期間, parameters):
        居住級地区分1 = 対象世帯("居住級地区分1", 対象期間)
        居住級地区分2 = 対象世帯("居住級地区分2", 対象期間)
        居住級地区分インデックス = np.select(
            [(居住級地区分1 == 1) * (居住級地区分2 == 1),
             (居住級地区分1 == 1) * (居住級地区分2 == 2),
             (居住級地区分1 == 2) * (居住級地区分2 == 1),
             (居住級地区分1 == 2) * (居住級地区分2 == 2),
             (居住級地区分1 == 3) * (居住級地区分2 == 1),
             (居住級地区分1 == 3) * (居住級地区分2 == 2)],
            list(range(6)),
            -1).astype(int)

        世帯人数 = 対象世帯("世帯人数", 対象期間)
        # 入院患者、施設入所者は世帯人数に含めない
        入院中 = 対象世帯.members("入院中", 対象期間)
        介護施設入所中 = 対象世帯.members("介護施設入所中", 対象期間)
        世帯人数 = 対象世帯.sum(np.logical_not(入院中) * np.logical_not(介護施設入所中))
        # インデックスは0始まりなので1を引いて調整
        世帯人数区分インデックス = np.clip(世帯人数 - 1, 0, 4).astype(int)

        return 生活扶助基準1_第2類_基準額1表()[世帯人数区分インデックス, 居住級地区分インデックス]


class 生活扶助基準2(Variable):
    value_type = float
    entity = 世帯
    definition_period = DAY
    label = "生活扶助基準（第1類+第2類）②"
    reference = "https://www.mhlw.go.jp/content/000776372.pdf"
    documentation = """
    算出方法は以下リンクも参考になる。
    https://www.mhlw.go.jp/content/12002000/000771098.pdf
    https://www.holos.jp/media/welfare-amount-of-money.php
    https://www.wam.go.jp/wamappl/bb16GS70.nsf/0/573310120867b50d4925743c00047cb4/$FILE/20080501_1shiryou5_1.pdf
    """

    def formula(対象世帯, 対象期間, parameters):
        生活扶助基準2_第1類_基準額2 = 対象世帯("生活扶助基準2_第1類_基準額2", 対象期間)
        生活扶助基準2_逓減率2 = 対象世帯("生活扶助基準2_逓減率2", 対象期間)
        生活扶助基準2_第2類_基準額2 = 対象世帯("生活扶助基準2_第2類_基準額2", 対象期間)
        冬季加算 = 対象世帯("冬季加算", 対象期間)

        return 生活扶助基準2_第1類_基準額2 * 生活扶助基準2_逓減率2 + 生活扶助基準2_第2類_基準額2 + 冬季加算


class 生活扶助基準2_第1類_基準額2(Variable):
    value_type = float
    entity = 世帯
    definition_period = DAY
    label = "生活扶助基準(第1類) 基準額2"
    reference = "https://www.mhlw.go.jp/content/000776372.pdf"
    documentation = """
    算出方法は以下リンクも参考になる。
    https://www.mhlw.go.jp/content/12002000/000771098.pdf
    https://www.holos.jp/media/welfare-amount-of-money.php
    https://www.wam.go.jp/wamappl/bb16GS70.nsf/0/573310120867b50d4925743c00047cb4/$FILE/20080501_1shiryou5_1.pdf
    """

    def formula(対象世帯, 対象期間, _parameters):
        各世帯員の基準額 = 対象世帯.members("生活扶助基準2_第1類_基準額2_世帯員", 対象期間)
        return 対象世帯.sum(各世帯員の基準額)


class 生活扶助基準2_第1類_基準額2_世帯員(Variable):
    value_type = float
    entity = 人物
    definition_period = DAY
    label = "生活扶助基準(第1類) 基準額2"
    reference = "https://www.mhlw.go.jp/content/000776372.pdf"
    documentation = """
    算出方法は以下リンクも参考になる。
    https://www.mhlw.go.jp/content/12002000/000771098.pdf
    https://www.holos.jp/media/welfare-amount-of-money.php
    https://www.wam.go.jp/wamappl/bb16GS70.nsf/0/573310120867b50d4925743c00047cb4/$FILE/20080501_1shiryou5_1.pdf
    """

    def formula(対象人物, 対象期間, parameters):
        居住級地区分1 = 対象人物.世帯("居住級地区分1", 対象期間)
        居住級地区分2 = 対象人物.世帯("居住級地区分2", 対象期間)
        居住級地区分インデックス = np.select(
            [(居住級地区分1 == 1) * (居住級地区分2 == 1),
             (居住級地区分1 == 1) * (居住級地区分2 == 2),
             (居住級地区分1 == 2) * (居住級地区分2 == 1),
             (居住級地区分1 == 2) * (居住級地区分2 == 2),
             (居住級地区分1 == 3) * (居住級地区分2 == 1),
             (居住級地区分1 == 3) * (居住級地区分2 == 2)],
            list(range(6)),
            -1).astype(int)

        年齢 = 対象人物("年齢", 対象期間)
        年齢区分インデックス = np.select(
            [(年齢 >= 0) * (年齢 <= 2),
             (年齢 >= 3) * (年齢 <= 5),
             (年齢 >= 6) * (年齢 <= 11),
             (年齢 >= 12) * (年齢 <= 17),
             (年齢 >= 18) * (年齢 <= 19),
             (年齢 >= 20) * (年齢 <= 40),
             (年齢 >= 41) * (年齢 <= 59),
             (年齢 >= 60) * (年齢 <= 64),
             (年齢 >= 65) * (年齢 <= 69),
             (年齢 >= 70) * (年齢 <= 74),
             年齢 >= 75],
            list(range(11)),
            -1).astype(int)

        # NOTE: この行はentityを人物にして計算する必要がある
        # (世帯の場合、年齢区分の要素数が人物、居住級地区分の要素数が世帯となり配列の形式が一致せずエラーになる)
        各世帯員の基準額 = 生活扶助基準2_第1類_基準額2表()[年齢区分インデックス, 居住級地区分インデックス]

        return 各世帯員の基準額


class 生活扶助基準2_逓減率2(Variable):
    value_type = float
    entity = 世帯
    definition_period = DAY
    label = "生活扶助基準 逓減率2"
    reference = "https://www.mhlw.go.jp/content/000776372.pdf"
    documentation = """
    算出方法は以下リンクも参考になる。
    https://www.mhlw.go.jp/content/12002000/000771098.pdf
    https://www.holos.jp/media/welfare-amount-of-money.php
    https://www.wam.go.jp/wamappl/bb16GS70.nsf/0/573310120867b50d4925743c00047cb4/$FILE/20080501_1shiryou5_1.pdf
    """

    def formula(対象世帯, 対象期間, parameters):
        居住級地区分1 = 対象世帯("居住級地区分1", 対象期間)
        居住級地区分2 = 対象世帯("居住級地区分2", 対象期間)
        居住級地区分インデックス = np.select(
            [(居住級地区分1 == 1) * (居住級地区分2 == 1),
             (居住級地区分1 == 1) * (居住級地区分2 == 2),
             (居住級地区分1 == 2) * (居住級地区分2 == 1),
             (居住級地区分1 == 2) * (居住級地区分2 == 2),
             (居住級地区分1 == 3) * (居住級地区分2 == 1),
             (居住級地区分1 == 3) * (居住級地区分2 == 2)],
            list(range(6)),
            -1).astype(int)

        世帯人数 = 対象世帯("世帯人数", 対象期間)
        # 入院患者、施設入所者は世帯人数に含めない
        入院中 = 対象世帯.members("入院中", 対象期間)
        介護施設入所中 = 対象世帯.members("介護施設入所中", 対象期間)
        世帯人数 = 対象世帯.sum(np.logical_not(入院中) * np.logical_not(介護施設入所中))
        # インデックスは0始まりなので1を引いて調整
        世帯人数区分インデックス = np.clip(世帯人数 - 1, 0, 4).astype(int)

        return 生活扶助基準2_逓減率2表()[世帯人数区分インデックス, 居住級地区分インデックス]


class 生活扶助基準2_第2類_基準額2(Variable):
    value_type = float
    entity = 世帯
    definition_period = DAY
    label = "生活扶助基準(第2類) 基準額2"
    reference = "https://www.mhlw.go.jp/content/000776372.pdf"
    documentation = """
    算出方法は以下リンクも参考になる。
    https://www.mhlw.go.jp/content/12002000/000771098.pdf
    https://www.holos.jp/media/welfare-amount-of-money.php
    https://www.wam.go.jp/wamappl/bb16GS70.nsf/0/573310120867b50d4925743c00047cb4/$FILE/20080501_1shiryou5_1.pdf
    """

    def formula(対象世帯, 対象期間, parameters):
        居住級地区分1 = 対象世帯("居住級地区分1", 対象期間)
        居住級地区分2 = 対象世帯("居住級地区分2", 対象期間)
        居住級地区分インデックス = np.select(
            [(居住級地区分1 == 1) * (居住級地区分2 == 1),
             (居住級地区分1 == 1) * (居住級地区分2 == 2),
             (居住級地区分1 == 2) * (居住級地区分2 == 1),
             (居住級地区分1 == 2) * (居住級地区分2 == 2),
             (居住級地区分1 == 3) * (居住級地区分2 == 1),
             (居住級地区分1 == 3) * (居住級地区分2 == 2)],
            list(range(6)),
            -1).astype(int)

        世帯人数 = 対象世帯("世帯人数", 対象期間)
        # 入院患者、施設入所者は世帯人数に含めない
        入院中 = 対象世帯.members("入院中", 対象期間)
        介護施設入所中 = 対象世帯.members("介護施設入所中", 対象期間)
        世帯人数 = 対象世帯.sum(np.logical_not(入院中) * np.logical_not(介護施設入所中))
        # インデックスは0始まりなので1を引いて調整
        世帯人数区分インデックス = np.clip(世帯人数 - 1, 0, 4).astype(int)

        return 生活扶助基準2_第2類_基準額2表()[世帯人数区分インデックス, 居住級地区分インデックス]


class 生活扶助本体に係る経過的加算(Variable):
    value_type = float
    entity = 世帯
    definition_period = DAY
    label = "生活扶助本体に係る経過的加算"
    reference = "https://www.mhlw.go.jp/content/000776372.pdf"
    documentation = """
    算出方法は以下リンクも参考になる。
    https://www.mhlw.go.jp/content/12002000/000771098.pdf
    https://www.holos.jp/media/welfare-amount-of-money.php
    https://www.wam.go.jp/wamappl/bb16GS70.nsf/0/573310120867b50d4925743c00047cb4/$FILE/20080501_1shiryou5_1.pdf
    """

    def formula(対象世帯, 対象期間, _parameters):
        # NOTE: 世帯で計算すると配列のサイズが合わずエラーになるため、人物ごとに計算
        加算額 = 対象世帯.members("生活扶助本体に係る経過的加算_世帯員", 対象期間)
        return 対象世帯.sum(加算額)


class 生活扶助本体に係る経過的加算_世帯員(Variable):
    value_type = float
    entity = 人物
    definition_period = DAY
    label = "生活扶助本体に係る経過的加算"
    reference = "https://www.mhlw.go.jp/content/000776372.pdf"
    documentation = """
    算出方法は以下リンクも参考になる。
    https://www.mhlw.go.jp/content/12002000/000771098.pdf
    https://www.holos.jp/media/welfare-amount-of-money.php
    https://www.wam.go.jp/wamappl/bb16GS70.nsf/0/573310120867b50d4925743c00047cb4/$FILE/20080501_1shiryou5_1.pdf
    """

    def formula(対象人物, 対象期間, _parameters):
        世帯人数 = 対象人物.世帯("世帯人数", 対象期間)
        # インデックスは0始まりのため1を引いて調整
        世帯人数区分インデックス = np.clip(世帯人数, 1, 5) - 1

        居住級地区分1 = 対象人物.世帯("居住級地区分1", 対象期間)
        居住級地区分2 = 対象人物.世帯("居住級地区分2", 対象期間)
        居住級地区分インデックス = np.select(
            [(居住級地区分1 == 1) * (居住級地区分2 == 1),
             (居住級地区分1 == 1) * (居住級地区分2 == 2),
             (居住級地区分1 == 2) * (居住級地区分2 == 1),
             (居住級地区分1 == 2) * (居住級地区分2 == 2),
             (居住級地区分1 == 3) * (居住級地区分2 == 1),
             (居住級地区分1 == 3) * (居住級地区分2 == 2)],
            list(range(6)),
            -1).astype(int)

        年齢 = 対象人物("年齢", 対象期間)
        年齢区分インデックス = np.select(
            [(年齢 >= 0) * (年齢 <= 2),
             (年齢 >= 3) * (年齢 <= 5),
             (年齢 >= 6) * (年齢 <= 11),
             (年齢 >= 12) * (年齢 <= 17),
             (年齢 >= 18) * (年齢 <= 19),
             (年齢 >= 20) * (年齢 <= 40),
             (年齢 >= 41) * (年齢 <= 59),
             (年齢 >= 60) * (年齢 <= 64),
             (年齢 >= 65) * (年齢 <= 69),
             (年齢 >= 70) * (年齢 <= 74),
             (年齢 >= 75)],
            list(range(11)),
            -1)

        # NOTE: この行はentityを人物にして計算する必要がある
        # (世帯の場合、年齢区分の要素数が人物、居住級地区分の要素数が世帯となり配列の形式が一致せずエラーになる)
        加算額 = 生活扶助本体に係る経過的加算表()[世帯人数区分インデックス, 年齢区分インデックス, 居住級地区分インデックス]
        return 加算額


class 障害者加算(Variable):
    value_type = float
    entity = 世帯
    definition_period = DAY
    label = "障害者に関する加算"
    reference = "https://www.mhlw.go.jp/content/000776372.pdf"
    documentation = """
    算出方法は以下リンクも参考になる。
    https://www.mhlw.go.jp/content/12002000/000771098.pdf
    https://www.holos.jp/media/welfare-amount-of-money.php
    https://www.wam.go.jp/wamappl/bb16GS70.nsf/0/573310120867b50d4925743c00047cb4/$FILE/20080501_1shiryou5_1.pdf
    """

    def formula(対象世帯, 対象期間, parameters):
        居住級地区分1 = 対象世帯("居住級地区分1", 対象期間)
        居住級地区分インデックス = np.select(
            [居住級地区分1 == 1,
             居住級地区分1 == 2,
             居住級地区分1 == 3],
            list(range(3)),
            -1).astype(int)

        身体障害者手帳等級 = 対象世帯.members("身体障害者手帳等級", 対象期間)
        # 該当者(1級~3級)のみ抽出
        身体障害者手帳等級インデックス = np.select(
            [身体障害者手帳等級 == 身体障害者手帳等級パターン.一級,
             身体障害者手帳等級 == 身体障害者手帳等級パターン.二級,
             身体障害者手帳等級 == 身体障害者手帳等級パターン.三級],
            list(range(3)),
            -1)

        対象である = 身体障害者手帳等級インデックス != -1
        加算額 = 障害者加算表()[身体障害者手帳等級インデックス, 居住級地区分インデックス]

        return 対象世帯.sum(対象である * 加算額)


class 母子加算(Variable):
    value_type = float
    entity = 世帯
    definition_period = DAY
    label = "母子世帯等に関する加算（父子世帯も対象）"
    reference = "https://www.mhlw.go.jp/content/000776372.pdf"
    documentation = """
    算出方法は以下リンクも参考になる。
    https://www.mhlw.go.jp/content/12002000/000771098.pdf
    https://www.holos.jp/media/welfare-amount-of-money.php
    https://www.wam.go.jp/wamappl/bb16GS70.nsf/0/573310120867b50d4925743c00047cb4/$FILE/20080501_1shiryou5_1.pdf
    """

    def formula(対象世帯, 対象期間, parameters):
        配偶者がいない = 対象世帯.nb_persons(世帯.親) == 1

        居住級地区分1 = 対象世帯("居住級地区分1", 対象期間)

        児童である = 対象世帯.members("児童", 対象期間)
        児童の人数 = 対象世帯.sum(児童である)

        居住級地区分1の金額 = 配偶者がいない * np.select(
            [児童の人数 == 1, 児童の人数 == 2, 児童の人数 >= 3],
            [18800, 23600, 23600 + 2900 * (児童の人数 - 2)],
            0)

        居住級地区分2の金額 = 配偶者がいない * np.select(
            [児童の人数 == 1, 児童の人数 == 2, 児童の人数 >= 3],
            [17400, 21800, 21800 + 2700 * (児童の人数 - 2)],
            0)

        居住級地区分3の金額 = 配偶者がいない * np.select(
            [児童の人数 == 1, 児童の人数 == 2, 児童の人数 >= 3],
            [16100, 20200, 20200 + 2500 * (児童の人数 - 2)],
            0)

        return np.select(
            [居住級地区分1 == 1,
             居住級地区分1 == 2,
             居住級地区分1 == 3],
            [居住級地区分1の金額,
             居住級地区分2の金額,
             居住級地区分3の金額],
            -1).astype(int)


class 児童(Variable):
    value_type = bool
    entity = 人物
    default_value = False
    definition_period = DAY
    label = "児童かどうか"
    reference = "https://www.mhlw.go.jp/content/000776372.pdf"
    documentation = """
    算出方法は以下リンクも参考になる。
    https://www.mhlw.go.jp/content/12002000/000771098.pdf
    https://www.holos.jp/media/welfare-amount-of-money.php
    https://www.wam.go.jp/wamappl/bb16GS70.nsf/0/573310120867b50d4925743c00047cb4/$FILE/20080501_1shiryou5_1.pdf
    """

    def formula(対象人物, 対象期間, parameters):
        # 児童とは、18歳になる日以後の最初の3月31日までの者
        年齢 = 対象人物("年齢", 対象期間)
        return np.select([年齢 < 18, 年齢 == 18, 年齢 > 18], [True, 対象期間.start.month <= 3, False], False)


class 児童を養育する場合の加算(Variable):
    value_type = float
    entity = 世帯
    definition_period = DAY
    label = "児童を養育する場合の加算"
    reference = "https://www.mhlw.go.jp/content/000776372.pdf"
    documentation = """
    算出方法は以下リンクも参考になる。
    https://www.mhlw.go.jp/content/12002000/000771098.pdf
    https://www.holos.jp/media/welfare-amount-of-money.php
    https://www.wam.go.jp/wamappl/bb16GS70.nsf/0/573310120867b50d4925743c00047cb4/$FILE/20080501_1shiryou5_1.pdf
    """

    def formula(対象世帯, 対象期間, parameters):
        児童である = 対象世帯.members("児童", 対象期間)
        児童の人数 = 対象世帯.sum(児童である)
        return 児童の人数 * 10190


class 母子世帯等に係る経過的加算(Variable):
    value_type = float
    entity = 世帯
    definition_period = DAY
    label = "母子世帯等に係る経過的加算（父子世帯も対象）"
    reference = "https://www.mhlw.go.jp/content/000776372.pdf"
    documentation = """
    算出方法は以下リンクも参考になる。
    https://www.mhlw.go.jp/content/12002000/000771098.pdf
    https://www.holos.jp/media/welfare-amount-of-money.php
    https://www.wam.go.jp/wamappl/bb16GS70.nsf/0/573310120867b50d4925743c00047cb4/$FILE/20080501_1shiryou5_1.pdf
    """

    def formula(対象世帯, 対象期間, _parameters):
        年齢 = 対象世帯.members("年齢", 対象期間)
        子供の年齢降順 = 対象世帯.get_rank(対象世帯, -年齢, condition=対象世帯.has_role(世帯.子))
        # 子供の人数が1人であることは確認済みのため、第一子の年齢=子供の年齢となる
        第一子である = 子供の年齢降順 == 0
        子供の年齢 = 対象世帯.sum(第一子である * 年齢)

        居住級地区分1 = 対象世帯("居住級地区分1", 対象期間)
        居住級地区分2 = 対象世帯("居住級地区分2", 対象期間)
        居住級地区分インデックス = np.select(
            [(居住級地区分1 == 1) * (居住級地区分2 == 1),
             (居住級地区分1 == 1) * (居住級地区分2 == 2),
             (居住級地区分1 == 2) * (居住級地区分2 == 1),
             (居住級地区分1 == 2) * (居住級地区分2 == 2),
             (居住級地区分1 == 3) * (居住級地区分2 == 1),
             (居住級地区分1 == 3) * (居住級地区分2 == 2)],
            list(range(6)),
            -1).astype(int)

        世帯人数 = 対象世帯("世帯人数", 対象期間)
        世帯人数区分インデックス = np.select(
            [世帯人数 == 3,
             世帯人数 == 4,
             世帯人数 >= 5],
            list(range(3)),
            -1).astype(int)

        年齢区分インデックス = np.select(
            [(子供の年齢 >= 0) * (子供の年齢 <= 2),
             (子供の年齢 >= 3) * (子供の年齢 <= 5),
             (子供の年齢 >= 6) * (子供の年齢 <= 11),
             (子供の年齢 >= 12) * (子供の年齢 <= 14),
             (子供の年齢 >= 15) * (子供の年齢 <= 17),
             (子供の年齢 >= 18) * (子供の年齢 < 20)],
            list(range(6)),
            -1).astype(int)

        子供の人数 = 対象世帯.nb_persons(世帯.子)
        配偶者がいない = 対象世帯.nb_persons(世帯.親) == 1
        対象である = (子供の人数 == 1) * 配偶者がいない * (世帯人数区分インデックス != -1) * (年齢区分インデックス != -1)

        return 対象である * 母子世帯等に係る経過的加算表()[世帯人数区分インデックス, 年齢区分インデックス, 居住級地区分インデックス]


class 入院中(Variable):
    value_type = bool
    default_value = False
    entity = 人物
    definition_period = DAY
    label = "入院しているか否か"


class 児童を養育する場合に係る経過的加算(Variable):
    value_type = float
    entity = 世帯
    definition_period = DAY
    label = "児童を養育する場合に係る経過的加算"
    reference = "https://www.mhlw.go.jp/content/000776372.pdf"
    documentation = """
    算出方法は以下リンクも参考になる。
    https://www.mhlw.go.jp/content/12002000/000771098.pdf
    https://www.holos.jp/media/welfare-amount-of-money.php
    https://www.wam.go.jp/wamappl/bb16GS70.nsf/0/573310120867b50d4925743c00047cb4/$FILE/20080501_1shiryou5_1.pdf
    """

    def formula(対象世帯, 対象期間, parameters):
        # プライベートメソッドが使用できないため、別クラスに切り出し
        三人以下の世帯であって三歳未満の児童が入院している場合の経過的加算 = 対象世帯("三人以下の世帯であって三歳未満の児童が入院している場合の経過的加算", 対象期間)
        四人以上の世帯であって三歳未満の児童がいる場合の経過的加算 = 対象世帯("四人以上の世帯であって三歳未満の児童がいる場合の経過的加算", 対象期間)
        第三子以降の三歳から小学生修了前の児童がいる場合の経過的加算 = 対象世帯("第三子以降の三歳から小学生修了前の児童がいる場合の経過的加算", 対象期間)
        return (
            三人以下の世帯であって三歳未満の児童が入院している場合の経過的加算
            + 四人以上の世帯であって三歳未満の児童がいる場合の経過的加算
            + 第三子以降の三歳から小学生修了前の児童がいる場合の経過的加算
        )


class 三人以下の世帯であって三歳未満の児童が入院している場合の経過的加算(Variable):
    value_type = float
    entity = 世帯
    definition_period = DAY
    label = "児童を養育する場合に係る経過的加算（３人以下の世帯であって、３歳未満の児童が入院している等の場合）"
    reference = "https://www.mhlw.go.jp/content/000776372.pdf"
    documentation = """
    算出方法は以下リンクも参考になる。
    https://www.mhlw.go.jp/content/12002000/000771098.pdf
    https://www.holos.jp/media/welfare-amount-of-money.php
    https://www.wam.go.jp/wamappl/bb16GS70.nsf/0/573310120867b50d4925743c00047cb4/$FILE/20080501_1shiryou5_1.pdf
    """

    def formula(対象世帯, 対象期間, parameters):
        世帯人数 = 対象世帯("世帯人数", 対象期間)
        対象である = 世帯人数 <= 3

        各世帯員の年齢 = 対象世帯.members("年齢", 対象期間)
        各世帯員が3歳未満 = 各世帯員の年齢 < 3
        各世帯員が入院中 = 対象世帯.members("入院中", 対象期間)
        加算対象者数 = 対象世帯.sum(各世帯員が3歳未満 & 各世帯員が入院中)
        return 対象である * (加算対象者数 * 4330)


class 四人以上の世帯であって三歳未満の児童がいる場合の経過的加算(Variable):
    value_type = float
    entity = 世帯
    definition_period = DAY
    label = "児童を養育する場合に係る経過的加算（４人以上の世帯であって、３歳未満の児童がいる場合）"
    reference = "https://www.mhlw.go.jp/content/000776372.pdf"
    documentation = """
    算出方法は以下リンクも参考になる。
    https://www.mhlw.go.jp/content/12002000/000771098.pdf
    https://www.holos.jp/media/welfare-amount-of-money.php
    https://www.wam.go.jp/wamappl/bb16GS70.nsf/0/573310120867b50d4925743c00047cb4/$FILE/20080501_1shiryou5_1.pdf
    """

    def formula(対象世帯, 対象期間, parameters):
        世帯人数 = 対象世帯("世帯人数", 対象期間)
        対象である = 世帯人数 >= 4

        各世帯員の年齢 = 対象世帯.members("年齢", 対象期間)
        各世帯員が3歳未満かどうか = 各世帯員の年齢 < 3
        加算対象者数 = 対象世帯.sum(各世帯員が3歳未満かどうか)
        return 対象である * (加算対象者数 * 4330)


class 第三子以降の三歳から小学生修了前の児童がいる場合の経過的加算(Variable):
    value_type = float
    entity = 世帯
    definition_period = DAY
    label = "児童を養育する場合に係る経過的加算（第３子以降の「３歳から小学生修了前」の児童がいる場合）"
    reference = "https://www.mhlw.go.jp/content/000776372.pdf"
    documentation = """
    算出方法は以下リンクも参考になる。
    https://www.mhlw.go.jp/content/12002000/000771098.pdf
    https://www.holos.jp/media/welfare-amount-of-money.php
    https://www.wam.go.jp/wamappl/bb16GS70.nsf/0/573310120867b50d4925743c00047cb4/$FILE/20080501_1shiryou5_1.pdf
    """

    def formula(対象世帯, 対象期間, _parameters):
        子供である = 対象世帯.has_role(世帯.子)

        年齢 = 対象世帯.members("年齢", 対象期間)
        子供の年齢の降順インデックス = 対象世帯.get_rank(対象世帯, -年齢, condition=子供である)

        # NOTE: インデックスは0始まりのため、0は第一子, 1は第二子を意味する。また、子でない場合-1となるため該当しない
        第三子以降である = 子供の年齢の降順インデックス > 1

        三歳以上である = 年齢 >= 3

        学年 = 対象世帯.members("学年", 対象期間)
        小学生終了前である = 学年 <= 6

        加算対象者数 = 対象世帯.sum(第三子以降である & 三歳以上である & 小学生終了前である)
        return 加算対象者数 * 4330


class 放射線障害者パターン(Enum):
    __order__ = "無 現罹患者 元罹患者"
    無 = "無"
    現罹患者 = "現罹患者"
    元罹患者 = "元罹患者"


class 放射線障害(Variable):
    value_type = Enum
    possible_values = 放射線障害者パターン
    default_value = 放射線障害者パターン.無
    entity = 人物
    definition_period = DAY
    label = "放射線障害状況"


class 放射線障害者加算(Variable):
    value_type = float
    entity = 世帯
    definition_period = DAY
    label = "放射線障害者加算"
    reference = "https://www.mhlw.go.jp/content/12002000/000771098.pdf"
    documentation = """
    算出方法は以下リンクも参考になる。
    https://seikatsuhogo.biz/blogs/105
    """

    def formula(対象世帯, 対象期間, parameters):
        各世帯員の放射線障害 = 対象世帯.members("放射線障害", 対象期間)
        現罹患者の人数 = 対象世帯.sum(各世帯員の放射線障害 == 放射線障害者パターン.現罹患者)
        元罹患者の人数 = 対象世帯.sum(各世帯員の放射線障害 == 放射線障害者パターン.元罹患者)

        return 現罹患者の人数 * 43830 + 元罹患者の人数 * 21920


class 妊産婦パターン(Enum):
    __order__ = "無 妊娠6ヵ月未満 妊娠6ヵ月以上 産後6ヵ月以内"
    無 = "無"
    妊娠6ヵ月未満 = "妊娠6ヵ月未満"
    妊娠6ヵ月以上 = "妊娠6ヵ月以上"
    産後6ヵ月以内 = "産後6ヵ月以内"


class 妊産婦(Variable):
    value_type = Enum
    possible_values = 妊産婦パターン
    default_value = 妊産婦パターン.無
    entity = 人物
    definition_period = DAY
    label = "妊産婦の妊娠、産後状況"


class 妊産婦加算(Variable):
    value_type = float
    entity = 世帯
    definition_period = DAY
    label = "妊産婦加算"
    reference = "https://www.mhlw.go.jp/content/12002000/000771098.pdf"
    documentation = """
    算出方法は以下リンクも参考になる。
    https://seikatsuhogo.biz/blogs/105
    """

    def formula(対象世帯, 対象期間, parameters):
        妊産婦 = 対象世帯.members("妊産婦", 対象期間)
        妊娠6ヵ月未満の人数 = 対象世帯.sum(妊産婦 == 妊産婦パターン.妊娠6ヵ月未満)
        妊娠6ヵ月以上の人数 = 対象世帯.sum(妊産婦 == 妊産婦パターン.妊娠6ヵ月以上)
        産後6ヵ月以内の人数 = 対象世帯.sum(妊産婦 == 妊産婦パターン.産後6ヵ月以内)

        return 妊娠6ヵ月未満の人数 * 9130 + 妊娠6ヵ月以上の人数 * 13790 + 産後6ヵ月以内の人数 * 8480


class 介護施設入所中(Variable):
    value_type = bool
    default_value = False
    entity = 人物
    definition_period = DAY
    label = "介護施設に入所しているか否か"


class 介護施設入所者加算(Variable):
    value_type = float
    entity = 世帯
    definition_period = DAY
    label = "介護施設入所者加算"
    reference = "https://www.mhlw.go.jp/content/12002000/000771098.pdf"
    documentation = """
    算出方法は以下リンクも参考になる。
    https://seikatsuhogo.biz/blogs/105
    """

    def formula(対象世帯, 対象期間, parameters):
        介護施設入所中 = 対象世帯.members("介護施設入所中", 対象期間)
        # NOTE: 世帯ごとに人数を数える必要があるため対象世帯.sumは使えない（Trueは1、Falseは0なのでsumを取ることで人数が分かる）
        加算対象者数 = 対象世帯.sum(介護施設入所中)
        return 加算対象者数 * 9880


class 在宅療養中(Variable):
    value_type = bool
    default_value = False
    entity = 人物
    definition_period = DAY
    label = "在宅で療養に専念している患者(結核又は3ヶ月以上の治療を要するもの)か否か"


class 在宅患者加算(Variable):
    value_type = float
    entity = 世帯
    definition_period = DAY
    label = "在宅患者加算"
    reference = "https://www.mhlw.go.jp/content/12002000/000771098.pdf"
    documentation = """
    算出方法は以下リンクも参考になる。
    https://seikatsuhogo.biz/blogs/105
    """

    def formula(対象世帯, 対象期間, parameters):
        各世帯員が在宅療養中 = 対象世帯.members("在宅療養中", 対象期間)
        加算対象者数 = 対象世帯.sum(各世帯員が在宅療養中)
        return 加算対象者数 * 13270


class 住宅扶助基準(Variable):
    value_type = float
    entity = 世帯
    definition_period = DAY
    label = "住宅扶助基準"
    reference = "http://kobekoubora.life.coocan.jp/2021juutakufujo.pdf"
    documentation = """
    算出方法は以下リンクも参考になる。
    https://www.mhlw.go.jp/content/12002000/000771098.pdf
    https://www.holos.jp/media/welfare-amount-of-money.php
    https://www.wam.go.jp/wamappl/bb16GS70.nsf/0/573310120867b50d4925743c00047cb4/$FILE/20080501_1shiryou5_1.pdf
    """

    def formula(対象世帯, 対象期間, parameters):
        # 算出できるのは上限額だが、額が大きいため加算する
        # NOTE: 母子家庭や障害、病気などで特定の病院の近くに住む必要があるといった場合には、特別加算分が計上される場合もあるが、
        # 判定条件不明のため一旦無視
        居住都道府県 = 対象世帯("居住都道府県", 対象期間)
        居住市区町村 = 対象世帯("居住市区町村", 対象期間)
        居住級地区分1 = 対象世帯("居住級地区分1", 対象期間)

        世帯人数 = 対象世帯("世帯人数", 対象期間)
        世帯人員区分 = np.select(
            [世帯人数 == 1,
             世帯人数 == 2,
             (世帯人数 >= 3) * (世帯人数 <= 5),
             世帯人数 == 6,
             世帯人数 >= 7],
            list(range(5)),
            -1).astype(int)

        市区町村名一覧 = 市ごとの住宅扶助限度額_キー一覧()
        居住市区町村区分 = np.select(
            [居住市区町村 == 市区町村 for 市区町村 in 市区町村名一覧],
            list(range(len(市区町村名一覧))),
            -1).astype(int)

        # p.4~6までの市に居住している場合はp.4~6を適用
        市ごとの住宅扶助限度金額 = 市ごとの住宅扶助限度額()[居住市区町村区分, 世帯人員区分]

        都道府県キー一覧 = 都道府県ごとの住宅扶助限度額_キー一覧()
        都道府県区分 = np.select(
            [(居住都道府県 == キー["都道府県"]) * (居住級地区分1 == キー["級地"]) for キー in 都道府県キー一覧],
            list(range(len(都道府県キー一覧))),
            -1).astype(int)

        # それ以外の市区町村に居住している場合はp.1~3を適用
        都道府県ごとの住宅扶助限度金額 = 都道府県ごとの住宅扶助限度額()[都道府県区分, 世帯人員区分]

        市ごとの住宅扶助限度額が適用される = 居住市区町村区分 != -1

        return (市ごとの住宅扶助限度額が適用される * 市ごとの住宅扶助限度金額) + (np.logical_not(市ごとの住宅扶助限度額が適用される) * 都道府県ごとの住宅扶助限度金額)


class 教育扶助基準(Variable):
    value_type = float
    entity = 世帯
    definition_period = DAY
    label = "教育扶助基準"
    reference = "https://www.mhlw.go.jp/content/000776372.pdf"
    documentation = """
    算出方法は以下リンクも参考になる。
    https://www.mhlw.go.jp/content/12002000/000771098.pdf
    https://www.holos.jp/media/welfare-amount-of-money.php
    https://www.wam.go.jp/wamappl/bb16GS70.nsf/0/573310120867b50d4925743c00047cb4/$FILE/20080501_1shiryou5_1.pdf
    """

    def formula(対象世帯, 対象期間, parameters):
        学年 = 対象世帯.members("学年", 対象期間)
        支給額一覧 = np.select(
            [(学年 >= 1) * (学年 <= 6), (学年 >= 7) * (学年 <= 9)],
            [2600, 5100],
            0)
        return 対象世帯.sum(支給額一覧)


class 高等学校等就学費(Variable):
    value_type = float
    entity = 世帯
    definition_period = DAY
    label = "高等学校等就学費"
    reference = "https://www.mhlw.go.jp/content/000776372.pdf"
    documentation = """
    算出方法は以下リンクも参考になる。
    https://www.mhlw.go.jp/content/12002000/000771098.pdf
    https://www.holos.jp/media/welfare-amount-of-money.php
    https://www.wam.go.jp/wamappl/bb16GS70.nsf/0/573310120867b50d4925743c00047cb4/$FILE/20080501_1shiryou5_1.pdf
    """

    def formula(対象世帯, 対象期間, parameters):
        学年 = 対象世帯.members("学年", 対象期間)
        就学費 = np.select(
            [(学年 >= 10) * (学年 <= 12)],
            [5300],
            0)
        return 対象世帯.sum(就学費)


class 冬季加算(Variable):
    value_type = float
    entity = 世帯
    definition_period = DAY
    label = "冬季加算"
    reference = "https://www.mhlw.go.jp/file/05-Shingikai-12601000-Seisakutoukatsukan-Sanjikanshitsu_Shakaihoshoutantou/26102103_6.pdf"
    documentation = """
    算出方法は以下リンクも参考になる。
    https://www.mhlw.go.jp/content/12002000/000771098.pdf
    https://www.holos.jp/media/welfare-amount-of-money.php
    https://www.wam.go.jp/wamappl/bb16GS70.nsf/0/573310120867b50d4925743c00047cb4/$FILE/20080501_1shiryou5_1.pdf
    """

    def formula(対象世帯, 対象期間, parameters):
        冬季である = 対象世帯("冬季", 対象期間)

        冬季加算地域区分1 = 対象世帯("冬季加算地域区分1", 対象期間)
        # インデックスは0始まり、区分は1始まりなので調整
        冬季加算地域区分インデックス = 冬季加算地域区分1 - 1

        世帯人数 = 対象世帯("世帯人数", 対象期間)
        世帯人数区分インデックス = np.select(
            [世帯人数 < 10],
            # インデックスは0始まりなので調整
            [世帯人数 - 1],
            -1).astype(int)

        居住級地区分1 = 対象世帯("居住級地区分1", 対象期間)
        居住級地区分2 = 対象世帯("居住級地区分2", 対象期間)
        居住級地区分インデックス = np.select(
            [(居住級地区分1 == 1) * (居住級地区分2 == 1),
             (居住級地区分1 == 1) * (居住級地区分2 == 2),
             (居住級地区分1 == 2) * (居住級地区分2 == 1),
             (居住級地区分1 == 2) * (居住級地区分2 == 2),
             (居住級地区分1 == 3) * (居住級地区分2 == 1),
             (居住級地区分1 == 3) * (居住級地区分2 == 2)],
            list(range(6)),
            -1).astype(int)

        # 9人の場合の加算に人数ごとの加算を追加
        世帯人数十人以上の場合の加算金額 = 冬季加算表()[冬季加算地域区分インデックス, -2, 居住級地区分インデックス] +\
            (世帯人数 - 9) * 冬季加算表()[冬季加算地域区分インデックス, -1, 居住級地区分インデックス]

        加算金額 = np.select(
            [世帯人数 >= 10],
            [世帯人数十人以上の場合の加算金額],
            冬季加算表()[冬季加算地域区分インデックス, 世帯人数区分インデックス, 居住級地区分インデックス])

        return 冬季である * 加算金額


class 冬季加算地域区分1(Variable):
    value_type = int
    entity = 世帯
    definition_period = DAY
    label = "冬季加算地域区分"
    reference = "https://www.mhlw.go.jp/file/05-Shingikai-12601000-Seisakutoukatsukan-Sanjikanshitsu_Shakaihoshoutantou/26102103_6.pdf"
    documentation = """
    算出方法は以下リンクも参考になる。
    https://www.mhlw.go.jp/content/12002000/000771098.pdf
    https://www.holos.jp/media/welfare-amount-of-money.php
    https://www.wam.go.jp/wamappl/bb16GS70.nsf/0/573310120867b50d4925743c00047cb4/$FILE/20080501_1shiryou5_1.pdf
    """

    def formula(対象世帯, 対象期間, _parameters):
        居住都道府県 = 対象世帯("居住都道府県", 対象期間)
        地域区分表キー一覧 = 地域区分表_キー一覧()
        居住都道府県インデックス = np.select(
            [居住都道府県 == 都道府県 for 都道府県 in 地域区分表キー一覧],
            list(range(len(地域区分表キー一覧))),
            -1).astype(int)

        地域区分 = 地域区分表()[居住都道府県インデックス]

        # 票に含まれないものは区分6
        return np.select([居住都道府県インデックス != -1],
                         [地域区分],
                         6)


class 冬季(Variable):
    value_type = bool
    default_value = False
    entity = 世帯
    definition_period = DAY
    label = "冬季加算の対象となる期間内であるかどうか"
    reference = "https://www.mhlw.go.jp/file/05-Shingikai-12601000-Seisakutoukatsukan-Sanjikanshitsu_Shakaihoshoutantou/26102103_6.pdf"
    documentation = """
    算出方法は以下リンクも参考になる。
    https://seikatsuhogo.biz/blogs/105
    """

    def formula(対象世帯, 対象期間, parameters):
        冬季加算地域区分1 = 対象世帯("冬季加算地域区分1", 対象期間)

        月 = 対象期間.date.month

        # 11~3月（I, II区は10~4月）を冬季とする
        return np.select([(冬季加算地域区分1 == 1) + (冬季加算地域区分1 == 2)],
                         [(月 <= 4) + (月 >= 10)],
                         (月 <= 3) + (月 >= 11))


class 期末一時扶助(Variable):
    value_type = float
    entity = 世帯
    definition_period = DAY
    label = "期末一時扶助"
    # TODO: 計算式について、官公庁の参考リンクも追加
    reference = "https://seikatsuhogo.biz/blogs/61"
    documentation = """
    算出方法は以下リンクも参考になる。
    https://www.mhlw.go.jp/content/12002000/000771098.pdf
    https://www.holos.jp/media/welfare-amount-of-money.php
    https://www.wam.go.jp/wamappl/bb16GS70.nsf/0/573310120867b50d4925743c00047cb4/$FILE/20080501_1shiryou5_1.pdf
    """

    def formula(対象世帯, 対象期間, parameters):
        # 対象期間が12月の時のみ支給
        対象月である = 対象期間.date.month == 12

        世帯人数 = 対象世帯("世帯人数", 対象期間)
        # インデックスは0始まりのため調整
        世帯人数区分インデックス = 世帯人数 - 1

        居住級地区分1 = 対象世帯("居住級地区分1", 対象期間)
        居住級地区分2 = 対象世帯("居住級地区分2", 対象期間)
        居住級地区分インデックス = np.select(
            [(居住級地区分1 == 1) * (居住級地区分2 == 1),
             (居住級地区分1 == 1) * (居住級地区分2 == 2),
             (居住級地区分1 == 2) * (居住級地区分2 == 1),
             (居住級地区分1 == 2) * (居住級地区分2 == 2),
             (居住級地区分1 == 3) * (居住級地区分2 == 1),
             (居住級地区分1 == 3) * (居住級地区分2 == 2)],
            list(range(6)),
            -1).astype(int)

        # 9人の場合の加算に人数ごとの加算を追加
        世帯人数十人以上の場合の金額 = 期末一時扶助表()[-2, 居住級地区分インデックス] +\
            (世帯人数 - 9) * 期末一時扶助表()[-1, 居住級地区分インデックス]

        # NOTE: out of boundにならないようclipでインデックスの上限値を設定（10人以上の場合もこの値自体は計算される）
        世帯人数九人以下の場合の金額 = 期末一時扶助表()[np.clip(世帯人数区分インデックス, 0, 9), 居住級地区分インデックス]

        金額 = np.select(
            [世帯人数 > 9],
            [世帯人数十人以上の場合の金額],
            世帯人数九人以下の場合の金額)
        return 対象月である * 金額


class 勤労控除(Variable):
    value_type = float
    entity = 世帯
    definition_period = DAY
    label = "勤労控除"
    reference = "https://www.mhlw.go.jp/content/12002000/000771098.pdf"
    documentation = """
    算出方法は以下リンクも参考になる。
    https://www.holos.jp/media/welfare-income-earn.php
    """

    def formula(対象世帯, 対象期間, parameters):
        基礎控除 = 対象世帯("生活保護基礎控除", 対象期間)
        新規就労控除 = 対象世帯("新規就労控除", 対象期間)
        未成年者控除 = 対象世帯("未成年者控除", 対象期間)
        return 基礎控除 + 新規就労控除 + 未成年者控除


class 生活保護基礎控除(Variable):
    value_type = float
    entity = 世帯
    definition_period = DAY
    label = "生活保護における基礎控除"
    reference = "https://www.mhlw.go.jp/content/12002000/000771098.pdf"
    documentation = """
    所得税、住民税における基礎控除とは異なる。
    算出方法は以下リンクも参考になる。
    https://www.holos.jp/media/welfare-income-earn.php
    https://www.city.chiba.jp/hokenfukushi/hogo/documents/r3shinkijunngakuhyou.pdf
    """

    def formula(対象世帯, 対象期間, parameters):
        # TODO: 収入として年金等も入力するようになったら、勤労収入のみ計算対象に入れるようにする
        収入 = 対象世帯.members("収入", 対象期間)
        # 収入を高い順にソート
        収入の降順インデックス = 対象世帯.get_rank(対象世帯, -収入)
        月収 = 収入 / 12

        # 世帯で最も収入が多い世帯員が1人目の対象者
        一人目の対象者である = 収入の降順インデックス == 0
        二人目以降の対象者である = 収入の降順インデックス != 0

        一人目の控除 = np.clip((月収 - 15000) * 0.1 + 15000, 0, 月収)
        # 2人目以降の計算式は https://www.city.chiba.jp/hokenfukushi/hogo/documents/r3shinkijunngakuhyou.pdf の基礎控除表を参考に作成
        二人目以降の控除 = np.clip(np.clip((月収 - 41000) * 0.085, 0, None) + 14960 + np.clip(月収 - 14960, 0, 40), 0, 月収)

        return 対象世帯.sum(一人目の対象者である * 一人目の控除 + 二人目以降の対象者である * 二人目以降の控除)


class 六か月以内に新規就労(Variable):
    value_type = bool
    default_value = False
    entity = 人物
    definition_period = DAY
    label = "6か月以内に新たに継続性のある職業に従事したかどうか"


class 新規就労控除(Variable):
    value_type = float
    entity = 世帯
    definition_period = DAY
    label = "新規就労控除"
    reference = "https://www.mhlw.go.jp/content/12002000/000771098.pdf"
    documentation = """
    算出方法は以下リンクも参考になる。
    https://www.holos.jp/media/welfare-income-earn.php
    https://www.mhlw.go.jp/stf/shingi/2r9852000001ifbg-att/2r9852000001ifii.pdf (額は現在と異なる部分あり)
    """

    def formula(対象世帯, 対象期間, parameters):
        六か月以内に新規就労 = 対象世帯.members("六か月以内に新規就労", 対象期間)
        対象者数 = 対象世帯.sum(六か月以内に新規就労)
        return 対象者数 * 11700


class 未成年者控除(Variable):
    value_type = float
    entity = 世帯
    definition_period = DAY
    label = "未成年者控除"
    reference = "https://www.mhlw.go.jp/content/12002000/000771098.pdf"
    documentation = """
    算出方法は以下リンクも参考になる。
    https://www.holos.jp/media/welfare-income-earn.php
    https://www.mhlw.go.jp/stf/shingi/2r9852000001ifbg-att/2r9852000001ifii.pdf (額は現在と異なる部分あり)
    """

    def formula(対象世帯, 対象期間, parameters):
        未成年 = 対象世帯.members("年齢", 対象期間) < parameters(対象期間).全般.成人年齢
        # TODO: 収入として年金等も入力するようになったら、勤労収入のみ計算対象に入れるようにする
        就労中 = 対象世帯.members("収入", 対象期間) > 0
        対象者数 = 対象世帯.sum(未成年 & 就労中)
        return 対象者数 * 11600
\`\`\`

\`\`\`python
"""
生活福祉資金貸付制度の実装
"""

import numpy as np
from openfisca_core.periods import DAY
from openfisca_core.variables import Variable
from openfisca_japan.entities import 世帯
from openfisca_japan.variables.障害.愛の手帳 import 愛の手帳等級パターン
from openfisca_japan.variables.障害.療育手帳 import 療育手帳等級パターン
from openfisca_japan.variables.障害.精神障害者保健福祉手帳 import 精神障害者保健福祉手帳等級パターン
from openfisca_japan.variables.障害.身体障害者手帳 import 身体障害者手帳等級パターン


class 障害者手帳を持つ世帯員がいる(Variable):
    value_type = bool
    entity = 世帯
    definition_period = DAY
    label = "障害者手帳を持つ世帯員がいる"

    def formula(対象世帯, 対象期間, parameters):
        身体障害者手帳等級一覧 = 対象世帯.members("身体障害者手帳等級", 対象期間)
        精神障害者保健福祉手帳等級一覧 = 対象世帯.members("精神障害者保健福祉手帳等級", 対象期間)
        療育手帳等級一覧 = 対象世帯.members("療育手帳等級", 対象期間)
        愛の手帳等級一覧 = 対象世帯.members("愛の手帳等級", 対象期間)

        障害者手帳を持つ世帯員 = ((身体障害者手帳等級一覧 != 身体障害者手帳等級パターン.無)
                       + (精神障害者保健福祉手帳等級一覧 != 精神障害者保健福祉手帳等級パターン.無)
                       + (療育手帳等級一覧 != 療育手帳等級パターン.無)
                       + (愛の手帳等級一覧 != 愛の手帳等級パターン.無))

        return 対象世帯.any(障害者手帳を持つ世帯員)


class 六十五歳以上の世帯員がいる(Variable):
    value_type = bool
    entity = 世帯
    definition_period = DAY
    label = "六十五歳以上の世帯員がいる"

    def formula(対象世帯, 対象期間, parameters):
        年齢 = 対象世帯.members("年齢", 対象期間)
        return 対象世帯.any(年齢 >= 65)


class 高校1年生以上の子供がいる(Variable):
    value_type = bool
    entity = 世帯
    definition_period = DAY
    label = "高校1年生以上の子供がいる"

    def formula(対象世帯, 対象期間, parameters):
        高校1年生以上である = 対象世帯.members("学年", 対象期間) >= 10
        子供である = 対象世帯.has_role(世帯.子)
        return 対象世帯.any(高校1年生以上である * 子供である)


class 中学3年生以上の子供がいる(Variable):
    value_type = bool
    entity = 世帯
    definition_period = DAY
    label = "中学3年生以上の子供がいる"

    def formula(対象世帯, 対象期間, parameters):
        中学3年生以上である = 対象世帯.members("学年", 対象期間) >= 9
        子供である = 対象世帯.has_role(世帯.子)
        return 対象世帯.any(中学3年生以上である * 子供である)


class 生活支援費(Variable):
    value_type = float
    entity = 世帯
    definition_period = DAY
    label = "生活支援費"
    reference = "https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/hukushi_kaigo/seikatsuhogo/seikatsu-fukushi-shikin1/index.html"
    documentation = """
    詳細な金額、条件についてはこちらを参照。

    https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/hukushi_kaigo/seikatsuhogo/seikatsu-fukushi-shikin1/kashitsukejoken.html
    """

    def formula(対象世帯, 対象期間, parameters):
        住民税非課税世帯 = 対象世帯("住民税非課税世帯", 対象期間)  # openfisca_japan/variables/所得.py の「住民税非課税世帯」を参照している
        障害者手帳を持つ世帯員がいる = 対象世帯("障害者手帳を持つ世帯員がいる", 対象期間)
        六十五歳以上の世帯員がいる = 対象世帯("六十五歳以上の世帯員がいる", 対象期間)

        貸付条件 = 住民税非課税世帯 + 障害者手帳を持つ世帯員がいる + 六十五歳以上の世帯員がいる

        # openfisca_japan/parameters/福祉/生活福祉資金貸付制度/生活支援費_貸付上限額_単身.yaml を参照している
        生活支援費_貸付上限額_単身 = parameters(対象期間).福祉.生活福祉資金貸付制度.生活支援費_貸付上限額_単身
        生活支援費_貸付上限額_二人以上 = parameters(対象期間).福祉.生活福祉資金貸付制度.生活支援費_貸付上限額_二人以上

        世帯人数 = 対象世帯("世帯人数", 対象期間)

        生活支援費_貸付上限額 = np.select(
            [世帯人数 == 1, 世帯人数 > 1],
            [生活支援費_貸付上限額_単身, 生活支援費_貸付上限額_二人以上],
            0)

        return 貸付条件 * 生活支援費_貸付上限額


class 一時生活再建費(Variable):
    value_type = float
    entity = 世帯
    definition_period = DAY
    label = "一時生活再建費"
    reference = "https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/hukushi_kaigo/seikatsuhogo/seikatsu-fukushi-shikin1/index.html"
    documentation = """
    詳細な金額、条件についてはこちらを参照。

    https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/hukushi_kaigo/seikatsuhogo/seikatsu-fukushi-shikin1/kashitsukejoken.html
    """

    def formula(対象世帯, 対象期間, parameters):
        住民税非課税世帯 = 対象世帯("住民税非課税世帯", 対象期間)  # openfisca_japan/variables/所得.py の「住民税非課税世帯」を参照している
        障害者手帳を持つ世帯員がいる = 対象世帯("障害者手帳を持つ世帯員がいる", 対象期間)
        六十五歳以上の世帯員がいる = 対象世帯("六十五歳以上の世帯員がいる", 対象期間)

        # openfisca_japan/parameters/福祉/生活福祉資金貸付制度/一時生活再建費_貸付上限額.yaml を参照している
        貸付条件 = 住民税非課税世帯 + 障害者手帳を持つ世帯員がいる + 六十五歳以上の世帯員がいる
        一時生活再建費_貸付上限額 = parameters(対象期間).福祉.生活福祉資金貸付制度.一時生活再建費_貸付上限額

        return 貸付条件 * 一時生活再建費_貸付上限額


class 福祉費(Variable):
    value_type = float
    entity = 世帯
    definition_period = DAY
    label = "福祉費"
    reference = "https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/hukushi_kaigo/seikatsuhogo/seikatsu-fukushi-shikin1/index.html"

    def formula(対象世帯, 対象期間, _parameters):
        被災している = 対象世帯("被災している", 対象期間)
        福祉費_災害 = 対象世帯("福祉費_災害", 対象期間)
        福祉費_災害以外 = 対象世帯("福祉費_災害以外", 対象期間)

        # 被災している場合は災害関連の条件を優先して計算
        return np.where(被災している, 福祉費_災害, 福祉費_災害以外)


class 福祉費_災害(Variable):
    value_type = float
    entity = 世帯
    definition_period = DAY
    label = "福祉費（災害を受けたことにより臨時に必要となる経費）"
    reference = "https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/hukushi_kaigo/seikatsuhogo/seikatsu-fukushi-shikin1/index.html"
    documentation = """
    福祉費の用途ごとの条件、金額はこちらを参照。
    https://www.mhlw.go.jp/bunya/seikatsuhogo/fukushihi.html
    """

    def formula(対象世帯, 対象期間, parameters):
        住民税非課税世帯 = 対象世帯("住民税非課税世帯", 対象期間)  # openfisca_japan/variables/所得.py の「住民税非課税世帯」を参照している
        障害者手帳を持つ世帯員がいる = 対象世帯("障害者手帳を持つ世帯員がいる", 対象期間)
        六十五歳以上の世帯員がいる = 対象世帯("六十五歳以上の世帯員がいる", 対象期間)

        # TODO: 災害によって特例措置が適用される場合その条件にも対応
        貸付条件 = 住民税非課税世帯 + 障害者手帳を持つ世帯員がいる + 六十五歳以上の世帯員がいる

        貸付上限額 = parameters(対象期間).福祉.生活福祉資金貸付制度.福祉費_災害_貸付上限額
        return 貸付条件 * 貸付上限額


# TODO: 用途ごとに条件と金額を細かく出し分ける
class 福祉費_災害以外(Variable):
    value_type = float
    entity = 世帯
    definition_period = DAY
    label = "福祉費（災害以外の場合）"
    reference = "https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/hukushi_kaigo/seikatsuhogo/seikatsu-fukushi-shikin1/index.html"
    documentation = """
    福祉費の用途ごとの条件、金額はこちらを参照。
    https://www.mhlw.go.jp/bunya/seikatsuhogo/fukushihi.html
    """

    def formula(対象世帯, 対象期間, parameters):
        住民税非課税世帯 = 対象世帯("住民税非課税世帯", 対象期間)  # openfisca_japan/variables/所得.py の「住民税非課税世帯」を参照している
        障害者手帳を持つ世帯員がいる = 対象世帯("障害者手帳を持つ世帯員がいる", 対象期間)
        六十五歳以上の世帯員がいる = 対象世帯("六十五歳以上の世帯員がいる", 対象期間)

        # openfisca_japan/parameters/福祉/生活福祉資金貸付制度/福祉費_貸付上限額.yaml を参照している
        貸付条件 = 住民税非課税世帯 + 障害者手帳を持つ世帯員がいる + 六十五歳以上の世帯員がいる
        福祉費_貸付上限額 = parameters(対象期間).福祉.生活福祉資金貸付制度.福祉費_貸付上限額

        return 貸付条件 * 福祉費_貸付上限額


class 緊急小口資金(Variable):
    value_type = float
    entity = 世帯
    definition_period = DAY
    label = "緊急小口資金"
    reference = "https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/hukushi_kaigo/seikatsuhogo/seikatsu-fukushi-shikin1/index.html"
    documentation = """
    詳細な金額、条件についてはこちらを参照。

    https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/hukushi_kaigo/seikatsuhogo/seikatsu-fukushi-shikin1/kashitsukejoken.html
    """

    def formula(対象世帯, 対象期間, parameters):
        住民税非課税世帯 = 対象世帯("住民税非課税世帯", 対象期間)  # openfisca_japan/variables/所得.py の「住民税非課税世帯」を参照している
        障害者手帳を持つ世帯員がいる = 対象世帯("障害者手帳を持つ世帯員がいる", 対象期間)
        六十五歳以上の世帯員がいる = 対象世帯("六十五歳以上の世帯員がいる", 対象期間)

        # openfisca_japan/parameters/福祉/生活福祉資金貸付制度/緊急小口資金_貸付上限額.yaml を参照している
        貸付条件 = 住民税非課税世帯 + 障害者手帳を持つ世帯員がいる + 六十五歳以上の世帯員がいる
        緊急小口資金_貸付上限額 = parameters(対象期間).福祉.生活福祉資金貸付制度.緊急小口資金_貸付上限額

        return 貸付条件 * 緊急小口資金_貸付上限額


class 住宅入居費(Variable):
    value_type = float
    entity = 世帯
    definition_period = DAY
    label = "住宅入居費"
    reference = "https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/hukushi_kaigo/seikatsuhogo/seikatsu-fukushi-shikin1/index.html"
    documentation = """
    詳細な金額、条件についてはこちらを参照。

    https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/hukushi_kaigo/seikatsuhogo/seikatsu-fukushi-shikin1/kashitsukejoken.html
    """

    def formula(対象世帯, 対象期間, parameters):
        住民税非課税世帯 = 対象世帯("住民税非課税世帯", 対象期間)  # openfisca_japan/variables/所得.py の「住民税非課税世帯」を参照している
        障害者手帳を持つ世帯員がいる = 対象世帯("障害者手帳を持つ世帯員がいる", 対象期間)
        六十五歳以上の世帯員がいる = 対象世帯("六十五歳以上の世帯員がいる", 対象期間)

        # openfisca_japan/parameters/福祉/生活福祉資金貸付制度/住宅入居費_貸付上限額.yaml を参照している
        貸付条件 = 住民税非課税世帯 + 障害者手帳を持つ世帯員がいる + 六十五歳以上の世帯員がいる
        住宅入居費_貸付上限額 = parameters(対象期間).福祉.生活福祉資金貸付制度.住宅入居費_貸付上限額

        return 貸付条件 * 住宅入居費_貸付上限額


class 教育支援費(Variable):
    value_type = float
    entity = 世帯
    definition_period = DAY
    label = "教育支援費"
    reference = "https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/hukushi_kaigo/seikatsuhogo/seikatsu-fukushi-shikin1/index.html"
    documentation = """
    詳細な金額、条件についてはこちらを参照。

    https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/hukushi_kaigo/seikatsuhogo/seikatsu-fukushi-shikin1/kashitsukejoken.html
    """

    def formula(対象世帯, 対象期間, parameters):
        住民税非課税世帯 = 対象世帯("住民税非課税世帯", 対象期間)  # openfisca_japan/variables/所得.py の「住民税非課税世帯」を参照している
        高校1年生以上の子供がいる = 対象世帯("高校1年生以上の子供がいる", 対象期間)

        # openfisca_japan/parameters/福祉/生活福祉資金貸付制度/教育支援費_貸付上限額.yaml を参照している
        貸付条件 = 住民税非課税世帯 * 高校1年生以上の子供がいる
        教育支援費_貸付上限額 = parameters(対象期間).福祉.生活福祉資金貸付制度.教育支援費_貸付上限額

        return 貸付条件 * 教育支援費_貸付上限額


class 就学支度費(Variable):
    value_type = float
    entity = 世帯
    definition_period = DAY
    label = "就学支度費"
    reference = "https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/hukushi_kaigo/seikatsuhogo/seikatsu-fukushi-shikin1/index.html"
    documentation = """
    詳細な金額、条件についてはこちらを参照。

    https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/hukushi_kaigo/seikatsuhogo/seikatsu-fukushi-shikin1/kashitsukejoken.html
    """

    def formula(対象世帯, 対象期間, parameters):
        住民税非課税世帯 = 対象世帯("住民税非課税世帯", 対象期間)  # openfisca_japan/variables/所得.py の「住民税非課税世帯」を参照している
        中学3年生以上の子供がいる = 対象世帯("中学3年生以上の子供がいる", 対象期間)

        # openfisca_japan/parameters/福祉/生活福祉資金貸付制度/就学支度費_貸付上限額.yaml を参照している
        貸付条件 = 住民税非課税世帯 * 中学3年生以上の子供がいる
        就学支度費_貸付上限額 = parameters(対象期間).福祉.生活福祉資金貸付制度.就学支度費_貸付上限額

        return 貸付条件 * 就学支度費_貸付上限額


class 不動産担保型生活資金(Variable):
    value_type = float
    entity = 世帯
    definition_period = DAY
    label = "不動産担保型生活資金"
    reference = "https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/hukushi_kaigo/seikatsuhogo/seikatsu-fukushi-shikin1/index.html"
    documentation = """
    詳細な金額、条件についてはこちらを参照。

    https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/hukushi_kaigo/seikatsuhogo/seikatsu-fukushi-shikin1/kashitsukejoken.html
    """

    def formula(対象世帯, 対象期間, parameters):
        住民税非課税世帯 = 対象世帯("住民税非課税世帯", 対象期間)  # openfisca_japan/variables/所得.py の「住民税非課税世帯」を参照している
        六十五歳以上の世帯員がいる = 対象世帯("六十五歳以上の世帯員がいる", 対象期間)

        # openfisca_japan/parameters/福祉/生活福祉資金貸付制度/不動産担保型生活資金_貸付上限額.yaml を参照している
        貸付条件 = 住民税非課税世帯 * 六十五歳以上の世帯員がいる
        不動産担保型生活資金_貸付上限額 = parameters(対象期間).福祉.生活福祉資金貸付制度.不動産担保型生活資金_貸付上限額

        return 貸付条件 * 不動産担保型生活資金_貸付上限額
\`\`\`

\`\`\`python
"""
This file defines variables for the modelled legislation.

A variable is a property of an Entity such as a 人物, a 世帯…

See https://openfisca.org/doc/key-concepts/variables.html
"""

from functools import cache

import numpy as np
from openfisca_core.periods import DAY, period
from openfisca_core.variables import Variable
# Import the Entities specifically defined for this tax and benefit system
from openfisca_japan.entities import 世帯, 人物
from openfisca_japan.variables.全般 import 性別パターン

# NOTE: 項目数が多い金額表は可読性の高いCSV形式としている。


@cache
def 配偶者控除額表():
    """
    csvファイルから値を取得

    配偶者控除額表()[配偶者の所得区分, 納税者本人の所得区分] の形で参照可能
    """
    return np.genfromtxt("openfisca_japan/assets/住民税/配偶者控除額.csv",
                  delimiter=",", skip_header=1, dtype="int64")[np.newaxis, 1:]


@cache
def 老人控除対象配偶者_配偶者控除額表():
    """
    csvファイルから値を取得

    老人控除対象配偶者_配偶者控除額表()[配偶者の所得区分, 納税者本人の所得区分] の形で参照可能
    """
    return np.genfromtxt("openfisca_japan/assets/住民税/配偶者控除額_老人控除対象配偶者.csv",
                         delimiter=",", skip_header=1, dtype="int64")[np.newaxis, 1:]


@cache
def 配偶者特別控除額表():
    """
    csvファイルから値を取得

    配偶者特別控除額表()[配偶者の所得区分, 納税者本人の所得区分] の形で参照可能
    """
    return np.genfromtxt("openfisca_japan/assets/住民税/配偶者特別控除額.csv",
                  delimiter=",", skip_header=1, dtype="int64")[:, 1:]


class 住民税障害者控除(Variable):
    value_type = float
    entity = 人物
    definition_period = DAY
    label = "住民税における障害者控除額"
    reference = "https://www.tax.metro.tokyo.lg.jp/kazei/kojin_ju.html#gaiyo_07"
    documentation = """
    所得税における控除額とはことなるので注意（金額が異なるだけで条件は同じ）。
    OpenFiscaではクラス名をアプリ全体で一意にする必要があるため、先頭に「住民税」を追加。
    """

    def formula(対象人物, 対象期間, _parameters):
        # 自身が扶養に入っている、または同一生計配偶者である場合、納税者（世帯主）が控除を受ける
        扶養親族である = 対象人物("扶養親族である", 対象期間)
        同一生計配偶者である = 対象人物("同一生計配偶者である", 対象期間)
        被扶養者である = 扶養親族である + 同一生計配偶者である

        所得 = 対象人物("所得", 対象期間)
        所得降順 = 対象人物.get_rank(対象人物.世帯, -所得)
        # NOTE: 便宜上、被扶養者は所得が最も高い世帯員の扶養に入るとする
        所得が最も高い世帯員である = 所得降順 == 0

        控除対象額 = 対象人物("住民税障害者控除対象額", 対象期間)
        # NOTE: 異なる人物に対する値であるため、人物ではなく世帯ごとに集計（でないと「扶養者である」と要素がずれてしまい計算できない)
        被扶養者の合計控除額 = 対象人物.世帯.sum(被扶養者である * 控除対象額)

        # 最も所得が高い世帯員ではないが、一定以上の所得がある場合
        扶養に入っていない納税者である = np.logical_not(所得が最も高い世帯員である) * np.logical_not(被扶養者である)
        # 被扶養者は控除を受けない（扶養者が代わりに控除を受けるため）
        return 所得が最も高い世帯員である * (被扶養者の合計控除額 + 控除対象額) + 扶養に入っていない納税者である * 控除対象額


class 住民税障害者控除対象額(Variable):
    value_type = float
    entity = 人物
    definition_period = DAY
    label = "住民税障害者控除額の対象額"
    reference = "https://www.tax.metro.tokyo.lg.jp/kazei/kojin_ju.html#gaiyo_07"
    documentation = """
    実際の控除額は同一生計配偶者、扶養親族が該当する場合にも加算される
    """

    def formula(対象人物, 対象期間, parameters):
        # 障害者控除額は対象人物ごとに算出される
        # https://www.city.hirakata.osaka.jp/kosodate/0000000544.html
        同居特別障害者控除対象 = 対象人物("同居特別障害者控除対象", 対象期間)
        # 重複して該当しないよう、同居特別障害者控除対象の場合を除外
        特別障害者控除対象 = 対象人物("特別障害者控除対象", 対象期間) * np.logical_not(同居特別障害者控除対象)
        障害者控除対象 = 対象人物("障害者控除対象", 対象期間)

        同居特別障害者控除額 = parameters(対象期間).住民税.同居特別障害者控除額
        特別障害者控除額 = parameters(対象期間).住民税.特別障害者控除額
        障害者控除額 = parameters(対象期間).住民税.障害者控除額

        return 同居特別障害者控除対象 * 同居特別障害者控除額 + 特別障害者控除対象 * 特別障害者控除額 + 障害者控除対象 * 障害者控除額


class 住民税ひとり親控除(Variable):
    value_type = float
    entity = 人物
    definition_period = DAY
    label = "住民税におけるひとり親控除額"
    reference = "https://www.tax.metro.tokyo.lg.jp/kazei/kojin_ju.html#gaiyo_07"
    documentation = """
    所得税における控除額とはことなるので注意（金額が異なるだけで条件は同じ）。
    OpenFiscaではクラス名をアプリ全体で一意にする必要があるため、先頭に「住民税」を追加。
    """

    def formula_2020_01_01(対象人物, 対象期間, parameters):
        所得 = 対象人物("所得", 対象期間)
        # 児童扶養手当の対象と異なり、父母の遺棄・DV等は考慮しない
        # (参考：児童扶養手当 https://www.city.hirakata.osaka.jp/0000026828.html)
        親である = 対象人物.has_role(世帯.親)
        子である = 対象人物.has_role(世帯.子)
        対象ひとり親 = (対象人物.世帯.sum(親である) == 1) * (対象人物.世帯.sum(子である) >= 1)
        ひとり親控除額 = parameters(対象期間).住民税.ひとり親控除額
        ひとり親控除_所得制限額 = parameters(対象期間).住民税.ひとり親控除_所得制限額

        return 親である * ひとり親控除額 * 対象ひとり親 * (所得 < ひとり親控除_所得制限額)


class 住民税寡婦控除(Variable):
    value_type = float
    entity = 人物
    definition_period = DAY
    label = "住民税における寡婦控除額"
    reference = "https://www.tax.metro.tokyo.lg.jp/kazei/kojin_ju.html#gaiyo_07"
    documentation = """
    所得税における控除額とはことなるので注意（金額が異なるだけで条件は同じ）。
    OpenFiscaではクラス名をアプリ全体で一意にする必要があるため、先頭に「住民税」を追加。
    """

    def formula_2020_01_01(対象人物, 対象期間, parameters):
        所得 = 対象人物("所得", 対象期間)
        寡婦 = 対象人物("寡婦", 対象期間)
        寡婦控除額 = parameters(対象期間).住民税.寡婦控除額
        寡婦控除_所得制限額 = parameters(対象期間).住民税.寡婦控除_所得制限額

        return 寡婦控除額 * 寡婦 * (所得 <= 寡婦控除_所得制限額)


class 住民税勤労学生控除(Variable):
    value_type = float
    entity = 人物
    definition_period = DAY
    label = "住民税における勤労学生控除"
    reference = "https://www.tax.metro.tokyo.lg.jp/kazei/kojin_ju.html#gaiyo_07"
    documentation = """
    所得税における控除額とはことなるので注意（金額が異なるだけで条件は同じ）。
    OpenFiscaではクラス名をアプリ全体で一意にする必要があるため、先頭に「住民税」を追加。
    """

    def formula(対象人物, 対象期間, parameters):
        所得 = 対象人物("所得", 対象期間)
        学生である = 対象人物("学生", 対象期間)
        勤労学生控除額 = parameters(対象期間).住民税.勤労学生控除額
        勤労学生_所得制限額 = parameters(対象期間).住民税.勤労学生_所得制限額
        所得条件 = (所得 > 0) * (所得 <= 勤労学生_所得制限額)

        return 所得条件 * 学生である * 勤労学生控除額


class 住民税配偶者控除(Variable):
    value_type = float
    entity = 人物
    definition_period = DAY
    label = "住民税における配偶者控除"
    reference = "https://www.city.hiroshima.lg.jp/soshiki/26/202040.html"
    documentation = """
    所得税における控除額とはことなるので注意（金額が異なるだけで条件は同じ）。
    OpenFiscaではクラス名をアプリ全体で一意にする必要があるため、先頭に「住民税」を追加。
    配偶者特別控除とは異なる。
    配偶者の所得が配偶者控除の所得制限を超えた場合でも、配偶者特別控除が適用される可能性がある。
    老人控除対象かどうかは以下を参照。
    https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1182.htm
    """

    def formula(対象人物, 対象期間, _parameters):
        # 所得が高いほうが控除を受ける対象となる
        所得一覧 = 対象人物("所得", 対象期間)
        所得降順 = 対象人物.get_rank(対象人物.世帯, - 所得一覧, condition=対象人物.has_role(世帯.親))
        控除対象者である = (所得降順 == 0) * 対象人物.has_role(世帯.親)
        控除対象者の配偶者である = (所得降順 == 1) * 対象人物.has_role(世帯.親)
        控除対象者の所得 = 所得一覧 * 控除対象者である
        # NOTE: 異なる人物に対する値であるため、人物ではなく世帯ごとに集計（でないと「控除対象者の所得」と要素がずれてしまい計算できない)
        控除対象者の配偶者の所得 = 対象人物.世帯.sum(所得一覧 * 控除対象者の配偶者である)

        控除対象者の所得区分 = np.select(
            [控除対象者の所得 <= 9000000,
             (控除対象者の所得 > 9000000) * (控除対象者の所得 <= 9500000),
             (控除対象者の所得 > 9500000) * (控除対象者の所得 <= 10000000)],
            list(range(3)),
            -1).astype(int)

        控除対象者の配偶者の所得区分 = np.select(
            [控除対象者の配偶者の所得 <= 480000],
            [0],
            -1).astype(int)

        対象所得区分に該当する = (控除対象者の所得区分 != -1) * (控除対象者の配偶者の所得区分 != -1)  # 控除条件

        # NOTE: その年の12/31時点の年齢を参照
        # https://www.nta.go.jp/taxes/shiraberu/taxanswer/yogo/senmon.htm#word5
        該当年12月31日 = period(f"{対象期間.start.year}-12-31")
        該当年12月31日の年齢一覧 = 対象人物("年齢", 該当年12月31日)
        控除対象者の配偶者の年齢 = 該当年12月31日の年齢一覧 * 控除対象者の配偶者である
        # NOTE: 自分ではない人物についての計算のため、世帯で計算（でないと要素がずれてしまい計算できない）
        配偶者が老人控除対象である = 対象人物.世帯.sum(控除対象者の配偶者の年齢 >= 70)
        老人控除対象配偶者控除額 = 老人控除対象配偶者_配偶者控除額表()[控除対象者の配偶者の所得区分, 控除対象者の所得区分]

        通常配偶者控除額 = 配偶者控除額表()[控除対象者の配偶者の所得区分, 控除対象者の所得区分]

        配偶者控除額 = np.logical_not(配偶者が老人控除対象である) * 通常配偶者控除額 + 配偶者が老人控除対象である * 老人控除対象配偶者控除額

        配偶者がいる = 対象人物.世帯.sum(対象人物.has_role(世帯.親)) == 2  # 控除条件

        return 控除対象者である * 配偶者がいる * 対象所得区分に該当する * 配偶者控除額


class 住民税配偶者特別控除(Variable):
    value_type = float
    entity = 人物
    definition_period = DAY
    label = "住民税における配偶者特別控除"
    reference = "https://www.city.hiroshima.lg.jp/soshiki/26/202040.html"
    documentation = """
    所得税における控除額とはことなるので注意（金額が異なるだけで条件は同じ）。
    OpenFiscaではクラス名をアプリ全体で一意にする必要があるため、先頭に「住民税」を追加。
    """

    def formula(対象人物, 対象期間, _parameters):
        # 所得が高いほうが控除を受ける対象となる
        所得一覧 = 対象人物("所得", 対象期間)
        所得降順 = 対象人物.get_rank(対象人物.世帯, - 所得一覧, condition=対象人物.has_role(世帯.親))
        控除対象者である = (所得降順 == 0) * 対象人物.has_role(世帯.親)
        控除対象者の配偶者である = (所得降順 == 1) * 対象人物.has_role(世帯.親)
        控除対象者の所得 = 所得一覧 * 控除対象者である
        # NOTE: 異なる人物に対する値であるため、人物ではなく世帯ごとに集計（でないと「控除対象者の所得」と要素がずれてしまい計算できない)
        控除対象者の配偶者の所得 = 対象人物.世帯.sum(所得一覧 * 控除対象者の配偶者である)

        控除対象者の所得区分 = np.select(
            [控除対象者の所得 <= 9000000,
             (控除対象者の所得 > 9000000) * (控除対象者の所得 <= 9500000),
             (控除対象者の所得 > 9500000) * (控除対象者の所得 <= 10000000)],
            list(range(3)),
            -1).astype(int)

        控除対象者の配偶者の所得区分 = np.select(
            [(控除対象者の配偶者の所得 > 480000) * (控除対象者の配偶者の所得 <= 1000000),
             (控除対象者の配偶者の所得 > 1000000) * (控除対象者の配偶者の所得 <= 1050000),
             (控除対象者の配偶者の所得 > 1050000) * (控除対象者の配偶者の所得 <= 1100000),
             (控除対象者の配偶者の所得 > 1100000) * (控除対象者の配偶者の所得 <= 1150000),
             (控除対象者の配偶者の所得 > 1150000) * (控除対象者の配偶者の所得 <= 1200000),
             (控除対象者の配偶者の所得 > 1200000) * (控除対象者の配偶者の所得 <= 1250000),
             (控除対象者の配偶者の所得 > 1250000) * (控除対象者の配偶者の所得 <= 1300000),
             (控除対象者の配偶者の所得 > 1300000) * (控除対象者の配偶者の所得 <= 1330000)],
            list(range(8)),
            -1).astype(int)

        対象所得区分に該当する = (控除対象者の所得区分 != -1) * (控除対象者の配偶者の所得区分 != -1)  # 控除条件

        配偶者がいる = 対象人物.世帯.sum(対象人物.has_role(世帯.親)) == 2  # 控除条件

        return 控除対象者である * 配偶者がいる * 対象所得区分に該当する * 配偶者特別控除額表()[控除対象者の配偶者の所得区分, 控除対象者の所得区分]


class 住民税扶養控除(Variable):
    value_type = float
    entity = 人物
    definition_period = DAY
    label = "住民税における扶養控除"
    reference = "https://www.town.hinode.tokyo.jp/0000000519.html"
    documentation = """
    所得税における控除額とはことなるので注意（金額が異なるだけで条件は同じ）。
    OpenFiscaではクラス名をアプリ全体で一意にする必要があるため、先頭に「住民税」を追加。
    """

    def formula(対象人物, 対象期間, parameters):
        扶養親族である = 対象人物("扶養親族である", 対象期間)

        # NOTE: その年の12/31時点の年齢を参照
        # https://www.nta.go.jp/taxes/shiraberu/taxanswer/yogo/senmon.htm#word5
        該当年12月31日 = period(f"{対象期間.start.year}-12-31")
        年齢 = 対象人物("年齢", 該当年12月31日)

        控除対象扶養親族である = 扶養親族である * (年齢 >= 16)

        特定扶養親族である = 控除対象扶養親族である * (年齢 >= 19) * (年齢 < 23)
        老人扶養親族である = 控除対象扶養親族である * (年齢 >= 70)

        # NOTE: 入院中の親族は同居扱いだが老人ホーム等への入居は除く
        # TODO: 「同居していない親族」も世帯内で扱うようになったら同居老親かどうかの判定追加
        介護施設入所中 = 対象人物("介護施設入所中", 対象期間)
        同居している老人扶養親族である = 老人扶養親族である * np.logical_not(介護施設入所中)
        同居していない老人扶養親族である = 老人扶養親族である * 介護施設入所中

        # NOTE: np.selectのcondlistは最初に該当した条件で計算される
        扶養控除額 = np.select(
            [特定扶養親族である,
             同居している老人扶養親族である,
             同居していない老人扶養親族である,
             控除対象扶養親族である],
            [parameters(対象期間).住民税.扶養控除_特定扶養親族,
             parameters(対象期間).住民税.扶養控除_老人扶養親族_同居老親等,
             parameters(対象期間).住民税.扶養控除_老人扶養親族_同居老親等以外の者,
             parameters(対象期間).住民税.扶養控除_一般],
            0)

        所得 = 対象人物("所得", 対象期間)
        所得降順 = 対象人物.get_rank(対象人物.世帯, -所得)
        # NOTE: 便宜上所得が最も多い世帯員が扶養者であるとする
        扶養者である = 所得降順 == 0

        return 扶養者である * 対象人物.世帯.sum(扶養控除額)


class 住民税基礎控除(Variable):
    value_type = float
    entity = 世帯
    definition_period = DAY
    label = "住民税における基礎控除"
    reference = "https://www.city.yokohama.lg.jp/kurashi/koseki-zei-hoken/zeikin/y-shizei/kojin-shiminzei-kenminzei/kaisei/R3zeiseikaisei.html"

    def formula(対象世帯, 対象期間, _parameters):
        世帯高所得 = 対象世帯("世帯高所得", 対象期間)

        return np.select(
            [世帯高所得 <= 24000000,
             (世帯高所得 > 24000000) * (世帯高所得 <= 24500000),
             (世帯高所得 > 24500000) * (世帯高所得 <= 25000000)],
            [430000,
             290000,
             150000],
            0)


class 控除後住民税世帯高所得(Variable):
    value_type = float
    entity = 世帯
    definition_period = DAY
    label = "住民税計算において、各種控除が適用された後の世帯高所得額"
    reference = "https://www.town.hinode.tokyo.jp/0000000516.html"

    def formula(対象世帯, 対象期間, _parameters):
        # TODO: 社会保険料を追加
        世帯高所得 = 対象世帯("世帯高所得", 対象期間)
        配偶者控除一覧 = 対象世帯.members("住民税配偶者控除", 対象期間)
        配偶者控除 = 対象世帯.sum(配偶者控除一覧)
        配偶者特別控除一覧 = 対象世帯.members("住民税配偶者特別控除", 対象期間)
        配偶者特別控除 = 対象世帯.sum(配偶者特別控除一覧)
        扶養控除一覧 = 対象世帯.members("住民税扶養控除", 対象期間)
        扶養控除 = 対象世帯.sum(扶養控除一覧)
        障害者控除一覧 = 対象世帯.members("住民税障害者控除", 対象期間)
        障害者控除 = 対象世帯.sum(障害者控除一覧)
        ひとり親控除一覧 = 対象世帯.members("住民税ひとり親控除", 対象期間)
        ひとり親控除 = 対象世帯.sum(ひとり親控除一覧)
        寡婦控除一覧 = 対象世帯.members("住民税寡婦控除", 対象期間)
        寡婦控除 = 対象世帯.sum(寡婦控除一覧)
        勤労学生控除一覧 = 対象世帯.members("住民税勤労学生控除", 対象期間)
        勤労学生控除 = 対象世帯.sum(勤労学生控除一覧)
        基礎控除 = 対象世帯("住民税基礎控除", 対象期間)

        # 他の控除（雑損控除・医療費控除等）は定額でなく実費を元に算出するため除外する

        総控除額 = 配偶者控除 + 配偶者特別控除 + 扶養控除 + 障害者控除 + \
            ひとり親控除 + 寡婦控除 + 勤労学生控除 + 基礎控除

        # 負の数にならないよう、0円未満になった場合は0円に補正
        return np.clip(世帯高所得 - 総控除額, 0.0, None)


class 住民税非課税世帯(Variable):
    value_type = bool
    default_value = False
    entity = 世帯
    definition_period = DAY
    label = "住民税非課税世帯か否か（東京23区で所得割と均等割両方が非課税になる世帯）"
    reference = "https://financial-field.com/tax/entry-173575"

    # 市町村の級地により住民税均等割における非課税限度額が異なる
    # https://www.soumu.go.jp/main_content/000758656.pdf

    def formula(対象世帯, 対象期間, _parameters):
        世帯高所得 = 対象世帯("世帯高所得", 対象期間)
        世帯人数 = 対象世帯("世帯人数", 対象期間)
        居住級地区分1 = 対象世帯("居住級地区分1", 対象期間)

        級地区分倍率 = np.select([居住級地区分1 == 1, 居住級地区分1 == 2, 居住級地区分1 == 3],
                         [1, 0.9, 0.8],
            1)

        加算額 = np.select([世帯人数 == 1, 世帯人数 > 1],
                        [0, 210000 * 級地区分倍率],
                        0)

        return 世帯高所得 <= (350000 * 級地区分倍率 * 世帯人数 + 100000 + 加算額)


class 人的控除額の差(Variable):
    value_type = float
    entity = 世帯
    definition_period = DAY
    label = "所得税と住民税の控除の差額"
    reference = "https://money-bu-jpx.com/news/article043882/"
    documentation = """
    差額計算には一部例外あり
    例外についての詳細は https://www.town.hinode.tokyo.jp/0000000519.html も参考になる
    """

    def formula(対象世帯, 対象期間, _parameters):
        障害者控除差額 = 対象世帯.sum(対象世帯.members("障害者控除", 対象期間) - 対象世帯.members("住民税障害者控除", 対象期間))
        寡婦控除一覧 = 対象世帯.members("寡婦控除", 対象期間)
        住民税寡婦控除一覧 = 対象世帯.members("住民税寡婦控除", 対象期間)
        寡婦控除差額 = 対象世帯.sum(寡婦控除一覧 - 住民税寡婦控除一覧)
        勤労学生控除一覧 = 対象世帯.members("勤労学生控除", 対象期間)
        住民税勤労学生控除一覧 = 対象世帯.members("住民税勤労学生控除", 対象期間)
        勤労学生控除差額 = 対象世帯.sum(勤労学生控除一覧 - 住民税勤労学生控除一覧)
        配偶者控除一覧 = 対象世帯.members("配偶者控除", 対象期間)
        住民税配偶者控除一覧 = 対象世帯.members("住民税配偶者控除", 対象期間)
        配偶者控除差額 = 対象世帯.sum(配偶者控除一覧 - 住民税配偶者控除一覧)
        配偶者特別控除一覧 = 対象世帯.members("配偶者特別控除", 対象期間)
        住民税配偶者特別控除一覧 = 対象世帯.members("住民税配偶者特別控除", 対象期間)
        配偶者特別控除差額 = 対象世帯.sum(配偶者特別控除一覧 - 住民税配偶者特別控除一覧)
        扶養控除差額 = 対象世帯.sum(対象世帯.members("扶養控除", 対象期間) - 対象世帯.members("住民税扶養控除", 対象期間))

        # NOTE: 以下は実際の差額とは異なる計算式を使用 https://www.town.hinode.tokyo.jp/0000000519.html
        世帯高所得 = 対象世帯("世帯高所得", 対象期間)
        基礎控除差額 = np.where(世帯高所得 <= 25000000, 50000, 0)

        通常ひとり親控除差額一覧 = 対象世帯.members("ひとり親控除", 対象期間)
        住民税通常ひとり親控除差額一覧 = 対象世帯.members("住民税ひとり親控除", 対象期間)
        通常ひとり親控除差額 = 対象世帯.sum(通常ひとり親控除差額一覧 - 住民税通常ひとり親控除差額一覧)
        # ひとり親（父）の場合のみ差額が異なる
        性別一覧 = 対象世帯.members("性別", 対象期間)
        親である = 対象世帯.has_role(世帯.親)
        父親がいる = 対象世帯.sum((性別一覧 == 性別パターン.男性) * 親である)
        ひとり親父世帯である = (対象世帯.nb_persons(世帯.親) == 1) * 父親がいる

        ひとり親控除差額 = np.logical_not(ひとり親父世帯である) * 通常ひとり親控除差額 + (通常ひとり親控除差額 > 0) * ひとり親父世帯である * 10000

        return 障害者控除差額 + 寡婦控除差額 + 勤労学生控除差額 + 配偶者控除差額 + 配偶者特別控除差額 + 扶養控除差額 + 基礎控除差額 + ひとり親控除差額


class 調整控除(Variable):
    value_type = float
    entity = 世帯
    definition_period = DAY
    label = "調整控除"
    reference = "https://money-bu-jpx.com/news/article043882/"
    documentation = """
    所得税と住民税の控除の差額（一部例外あり）
    例外についての詳細は https://www.town.hinode.tokyo.jp/0000000519.html も参考になる
    """

    def formula(対象世帯, 対象期間, parameters):
        人的控除額の差 = 対象世帯("人的控除額の差", 対象期間)
        # 個人住民税の課税所得金額に相当
        控除後住民税世帯高所得 = 対象世帯("控除後住民税世帯高所得", 対象期間)
        控除後住民税世帯高所得と人的控除額の差の小さい方 =\
            控除後住民税世帯高所得 * (控除後住民税世帯高所得 < 人的控除額の差) + 人的控除額の差 * (控除後住民税世帯高所得 >= 人的控除額の差)

        控除額 = np.select(
            [控除後住民税世帯高所得 <= 2000000,
             (控除後住民税世帯高所得 > 2000000) * (控除後住民税世帯高所得 < 25000000)],
            [控除後住民税世帯高所得と人的控除額の差の小さい方 * 0.05,
             (人的控除額の差 - (控除後住民税世帯高所得 - 2000000)) * 0.05],
            0)

        # 負の数にならないよう、0円未満になった場合は0円に補正
        return np.clip(控除額, 0.0, None)
\`\`\`

\`\`\`python
"""
児童育成手当の実装
"""

import numpy as np
from openfisca_core.periods import DAY
from openfisca_core.variables import Variable
from openfisca_japan.entities import 世帯


class 児童育成手当(Variable):
    value_type = float
    entity = 世帯
    definition_period = DAY
    label = "保護者への児童手当"
    reference = "https://www.city.shibuya.tokyo.jp/kodomo/teate/hitorioya/hitorioya_teate.html"
    documentation = """
    渋谷区の児童育成手当制度

    - 〒150-8010 東京都渋谷区宇田川町1-1
    - 渋谷区子ども青少年課子育て給付係
    - 03-3463-2558
    """

    def formula(対象世帯, 対象期間, parameters):
        居住都道府県 = 対象世帯("居住都道府県", 対象期間)
        居住地条件 = 居住都道府県 == "東京都"

        児童育成手当 = parameters(対象期間).福祉.育児.児童育成手当

        # 世帯で最も高い所得の人が基準となる。特別児童扶養手当と同等の控除が適用される。
        # （参考）https://www.city.adachi.tokyo.jp/oyako/k-kyoiku/kosodate/hitorioya-ikuse.html
        世帯高所得 = 対象世帯("特別児童扶養手当の控除後世帯高所得", 対象期間)
        扶養人数 = 対象世帯("扶養人数", 対象期間)

        # NOTE: 直接 \`所得制限限度額[扶養人数]\` のように要素参照すると型が合わず複数世帯の場合に計算できないためnp.selectを使用
        所得制限限度額 = np.select(
            [扶養人数 == i for i in range(6)],
            [児童育成手当.所得制限限度額[i] for i in range(6)],
            -1).astype(int)

        所得条件 = 世帯高所得 < 所得制限限度額

        ひとり親世帯である = 対象世帯("ひとり親", 対象期間)
        学年 = 対象世帯.members("学年", 対象期間)
        上限学年以下の人数 = 対象世帯.sum(学年 <= 児童育成手当.上限学年)
        手当条件 = ひとり親世帯である * 所得条件 * 居住地条件

        return 手当条件 * 上限学年以下の人数 * 児童育成手当.金額
\`\`\`

\`\`\`python
"""
受験生チャレンジ支援貸付の実装
"""

import numpy as np
from openfisca_core.periods import DAY
from openfisca_core.variables import Variable
from openfisca_japan.entities import 世帯
from openfisca_japan.variables.全般 import 中学生学年, 高校生学年


class 受験生チャレンジ支援貸付(Variable):
    value_type = int
    default_value = 0
    entity = 世帯
    definition_period = DAY
    label = "受験生チャレンジ支援貸付"
    reference = "https://www.fukushi.metro.tokyo.lg.jp/seikatsu/teisyotokusyataisaku/jukenseichallenge.html"

    def formula(対象世帯, 対象期間, parameters):
        子供である = 対象世帯.has_role(世帯.子)
        学年 = 対象世帯.members("学年", 対象期間)

        中学三年生である = 学年 == 中学生学年.三年生.value
        高校三年生である = 学年 == 高校生学年.三年生.value

        学習塾等受講料 = 対象世帯.sum(子供である * (中学三年生である + 高校三年生である)) * parameters(対象期間).東京都.福祉.受験生チャレンジ支援貸付.学習塾等受講料
        高校受験料 = 対象世帯.sum(子供である * 中学三年生である) * parameters(対象期間).東京都.福祉.受験生チャレンジ支援貸付.高校受験料
        大学受験料 = 対象世帯.sum(子供である * 高校三年生である) * parameters(対象期間).東京都.福祉.受験生チャレンジ支援貸付.大学受験料

        年間支給金額 = 学習塾等受講料 + 高校受験料 + 大学受験料

        受験生チャレンジ支援貸付可能 = 対象世帯("受験生チャレンジ支援貸付可能", 対象期間)
        return 年間支給金額 * 受験生チャレンジ支援貸付可能


class 受験生チャレンジ支援貸付可能(Variable):
    value_type = int
    default_value = 0
    entity = 世帯
    definition_period = DAY
    label = "受験生チャレンジ支援貸付可能"
    reference = "https://www.fukushi.metro.tokyo.lg.jp/seikatsu/teisyotokusyataisaku/jukenseichallenge.html"

    def formula(対象世帯, 対象期間, _parameters):
        居住都道府県 = 対象世帯("居住都道府県", 対象期間)
        居住地条件 = 居住都道府県 == "東京都"

        預貯金一覧 = 対象世帯.members("預貯金", 対象期間)
        親または子である = 対象世帯.has_role(世帯.親) + 対象世帯.has_role(世帯.子)
        親子の預貯金総額 = 対象世帯.sum(預貯金一覧 * 親または子である)
        預貯金条件 = 親子の預貯金総額 <= 6000000

        ひとり親である = 対象世帯("ひとり親", 対象期間)
        世帯所得 = 対象世帯("世帯所得", 対象期間)
        世帯人数 = 対象世帯("世帯人数", 対象期間)

        ひとり親の場合の所得条件 =\
            ((世帯人数 == 2) * (世帯所得 <= 2805000)) +\
            ((世帯人数 == 3) * (世帯所得 <= 3532000)) +\
            ((世帯人数 == 4) * (世帯所得 <= 4175000)) +\
            ((世帯人数 == 5) * (世帯所得 <= 4674000))
        ひとり親でない場合の所得条件 =\
            ((世帯人数 == 3) * (世帯所得 <= 3087000)) +\
            ((世帯人数 == 4) * (世帯所得 <= 3599000)) +\
            ((世帯人数 == 5) * (世帯所得 <= 4149000)) +\
            ((世帯人数 == 6) * (世帯所得 <= 4776000))
        所得条件 = (ひとり親である * ひとり親の場合の所得条件) + (np.logical_not(ひとり親である) * ひとり親でない場合の所得条件)

        return 居住地条件 * 預貯金条件 * 所得条件
\`\`\`

\`\`\`python
"""
障害児童育成手当の実装
"""

import numpy as np
from openfisca_core.periods import DAY
from openfisca_core.variables import Variable
from openfisca_japan.entities import 世帯
from openfisca_japan.variables.障害.愛の手帳 import 愛の手帳等級パターン
from openfisca_japan.variables.障害.脳性まひ_進行性筋萎縮症 import 脳性まひ_進行性筋萎縮症パターン
from openfisca_japan.variables.障害.身体障害者手帳 import 身体障害者手帳等級パターン


class 障害児童育成手当(Variable):
    value_type = float
    entity = 世帯
    definition_period = DAY
    label = "保護者への障害児童育成手当"
    reference = "https://www.city.shibuya.tokyo.jp/kodomo/ninshin/teate/jido_i.html"
    documentation = """
    渋谷区の児童育成（障害）手当

    - 〒150-8010 東京都渋谷区宇田川町1-1
    - 渋谷区子ども青少年課子育て給付係
    - 03-3463-2558
    """

    def formula(対象世帯, 対象期間, parameters):
        居住都道府県 = 対象世帯("居住都道府県", 対象期間)
        居住地条件 = 居住都道府県 == "東京都"

        障害児童育成手当 = parameters(対象期間).福祉.育児.障害児童育成手当

        # 世帯で最も高い所得の人が基準となる。特別児童扶養手当と同等の控除が適用される。
        # （参考）https://www.city.adachi.tokyo.jp/oyako/k-kyoiku/kosodate/hitorioya-ikuse.html
        世帯高所得 = 対象世帯("特別児童扶養手当の控除後世帯高所得", 対象期間)
        扶養人数 = 対象世帯("扶養人数", 対象期間)

        # NOTE: 直接 \`所得制限限度額[扶養人数]\` のように要素参照すると型が合わず複数世帯の場合に計算できないためnp.selectを使用
        所得制限限度額 = np.select(
            [扶養人数 == i for i in range(6)],
            [障害児童育成手当.所得制限限度額[i] for i in range(6)],
            -1).astype(int)

        所得条件 = 世帯高所得 < 所得制限限度額

        身体障害者手帳等級一覧 = 対象世帯.members("身体障害者手帳等級", 対象期間)
        愛の手帳等級一覧 = 対象世帯.members("愛の手帳等級", 対象期間)
        脳性まひ_進行性筋萎縮症一覧 = 対象世帯.members("脳性まひ_進行性筋萎縮症", 対象期間)
        年齢 = 対象世帯.members("年齢", 対象期間)
        児童である = 対象世帯.has_role(世帯.子)
        上限年齢未満の児童 = 児童である * (年齢 < 障害児童育成手当.上限年齢)

        対象障害者手帳等級 = \
            (身体障害者手帳等級一覧 == 身体障害者手帳等級パターン.一級) + \
            (身体障害者手帳等級一覧 == 身体障害者手帳等級パターン.二級) + \
            (愛の手帳等級一覧 == 愛の手帳等級パターン.一度) + \
            (愛の手帳等級一覧 == 愛の手帳等級パターン.二度) + \
            (愛の手帳等級一覧 == 愛の手帳等級パターン.三度) + \
            (脳性まひ_進行性筋萎縮症一覧 == 脳性まひ_進行性筋萎縮症パターン.有)

        上限年齢未満の身体障害を持つ児童人数 = 対象世帯.sum(上限年齢未満の児童 & 対象障害者手帳等級)
        手当金額 = 障害児童育成手当.金額 * 上限年齢未満の身体障害を持つ児童人数

        return 居住地条件 * 所得条件 * 手当金額
\`\`\`

\`\`\`python
"""
重度心身障害者手当の実装
"""

import numpy as np
from openfisca_core.periods import DAY
from openfisca_core.variables import Variable
from openfisca_japan.entities import 世帯, 人物
from openfisca_japan.variables.障害.愛の手帳 import 愛の手帳等級パターン
from openfisca_japan.variables.障害.身体障害者手帳 import 身体障害者手帳等級パターン


class 重度心身障害者手当_最大(Variable):
    value_type = float
    entity = 世帯
    definition_period = DAY
    label = "重度心身障害者手当の最大額"
    reference = "https://www.fukushi.metro.tokyo.lg.jp/shinsho/teate/juudo.html"
    documentation = """
    東京都の制度
    厳密な判定には詳細な症状が必要なため、愛の手帳等級、身体障害者手帳等から推定可能な最小値、最大値を算出

    算出方法は以下リンクも参考になる。
    https://www.mhlw.go.jp/file/06-Seisakujouhou-12200000-Shakaiengokyokushougaihokenfukushibu/0000172197.pdf
    """

    def formula(対象世帯, 対象期間, parameters):
        居住都道府県 = 対象世帯("居住都道府県", 対象期間)
        # 東京都以外は対象外
        居住地条件 = 居住都道府県 == "東京都"

        年齢 = 対象世帯.members("年齢", 対象期間)
        年齢条件 = 年齢 < 65

        愛の手帳等級 = 対象世帯.members("愛の手帳等級", 対象期間)
        身体障害者手帳等級 = 対象世帯.members("身体障害者手帳等級", 対象期間)
        # 該当する可能性のある条件
        一号要件 = (愛の手帳等級 == 愛の手帳等級パターン.一度) | (愛の手帳等級 == 愛の手帳等級パターン.二度)
        二号要件 = ((愛の手帳等級 == 愛の手帳等級パターン.一度) | (愛の手帳等級 == 愛の手帳等級パターン.二度)) * \
            ((身体障害者手帳等級 == 身体障害者手帳等級パターン.一級) | (身体障害者手帳等級 == 身体障害者手帳等級パターン.二級))
        三号要件 = 身体障害者手帳等級 == 身体障害者手帳等級パターン.一級
        障害条件 = 一号要件 | 二号要件 | 三号要件

        所得条件 = 対象世帯.members("重度心身障害者手当所得制限", 対象期間)

        人物ごとの受給条件 = 年齢条件 * 障害条件 * 所得条件
        # NOTE: 居住地条件は世帯の条件のため、人物ごとの受給条件とは型が合わず直接計算できない
        対象人数 = 対象世帯.sum(人物ごとの受給条件) * 居住地条件

        return 対象人数 * parameters(対象期間).東京都.福祉.重度心身障害者手当.重度心身障害者手当額


class 重度心身障害者手当_最小(Variable):
    value_type = float
    entity = 世帯
    definition_period = DAY
    label = "重度心身障害者手当の最小額"
    reference = "https://www.fukushi.metro.tokyo.lg.jp/shinsho/teate/juudo.html"
    documentation = """
    東京都の制度
    厳密な判定には詳細な症状が必要なため、愛の手帳等級、身体障害者手帳等から推定可能な最小値、最大値を算出

    算出方法は以下リンクも参考になる。
    https://www.mhlw.go.jp/file/06-Seisakujouhou-12200000-Shakaiengokyokushougaihokenfukushibu/0000172197.pdf
    """

    def formula(対象世帯, 対象期間, parameters):
        居住都道府県 = 対象世帯("居住都道府県", 対象期間)
        # 東京都以外は対象外
        # 東京都以外は対象外
        居住地条件 = 居住都道府県 == "東京都"

        年齢 = 対象世帯.members("年齢", 対象期間)
        年齢条件 = 年齢 < 65

        愛の手帳等級 = 対象世帯.members("愛の手帳等級", 対象期間)
        身体障害者手帳等級 = 対象世帯.members("身体障害者手帳等級", 対象期間)
        # 1号要件,3号要件は愛の手帳、身体障害者手帳のみでは該当しない可能性があるため最小額は0
        二号要件 = ((愛の手帳等級 == 愛の手帳等級パターン.一度) | (愛の手帳等級 == 愛の手帳等級パターン.二度)) * \
            ((身体障害者手帳等級 == 身体障害者手帳等級パターン.一級) | (身体障害者手帳等級 == 身体障害者手帳等級パターン.二級))
        障害条件 = 二号要件

        所得条件 = 対象世帯.members("重度心身障害者手当所得制限", 対象期間)

        人物ごとの受給条件 = 年齢条件 * 障害条件 * 所得条件
        # NOTE: 居住地条件は世帯の条件のため、人物ごとの受給条件とは型が合わず直接計算できない
        対象人数 = 対象世帯.sum(人物ごとの受給条件) * 居住地条件

        return 対象人数 * parameters(対象期間).東京都.福祉.重度心身障害者手当.重度心身障害者手当額


class 重度心身障害者手当所得制限(Variable):
    value_type = bool
    entity = 人物
    definition_period = DAY
    label = "重度心身障害者手当の所得制限"
    reference = "https://www.fukushi.metro.tokyo.lg.jp/shinsho/teate/juudo.html"

    # TODO: 障害児福祉手当も同じ控除を適用する。
    # https://www.fukushi.metro.tokyo.lg.jp/shinsho/teate/jidou.html
    # 心身障害者手当も同じ控除になるか要調査

    def formula(対象人物, 対象期間, parameters):
        重度心身障害者手当 = parameters(対象期間).東京都.福祉.重度心身障害者手当
        扶養人数 = 対象人物.世帯("扶養人数", 対象期間)
        # 複数世帯入力(2以上の長さのndarray入力)対応のためndarray化
        所得制限限度額 = np.array(重度心身障害者手当.所得制限限度額)[np.clip(扶養人数, 0, 5)]

        所得 = 対象人物("所得", 対象期間)
        # 便宜上、世帯の最大の所得を扶養義務者の所得とする
        扶養義務者の所得 = 対象人物.世帯("世帯高所得", 対象期間)
        年齢 = 対象人物("年齢", 対象期間)
        # 20歳未満の場合扶養義務者、20歳以上の場合本人の所得を参照
        本人所得を参照 = 年齢 >= 20
        対象となる所得 = np.where(本人所得を参照, 所得, 扶養義務者の所得)

        給与所得及び雑所得からの控除額 = parameters(対象期間).所得.給与所得及び雑所得からの控除額
        社会保険料控除 = np.where(np.logical_not(本人所得を参照), parameters(対象期間).所得.社会保険料相当額, 0)
        # 上限33万円
        配偶者特別控除 = np.clip(対象人物("配偶者特別控除", 対象期間), 0, 330000)

        障害者控除 = 対象人物("障害者控除", 対象期間)

        # 障害者控除, 特別障害者控除については、本人所得の場合本人の分は適用しない
        障害者控除対象 = 対象人物("障害者控除対象", 対象期間)
        特別障害者控除対象 = 対象人物("特別障害者控除対象", 対象期間)
        本人の控除 = np.select(
            [障害者控除対象, 特別障害者控除対象],
            [parameters(対象期間).所得.障害者控除額, parameters(対象期間).所得.特別障害者控除額],
            0)
        障害者控除 = 障害者控除 - 本人所得を参照 * 本人の控除

        # TODO: 同居特別障害者の場合も通常の特別障害者と同じ額に補正する必要がある？
        # 単純に記載を省略しているだけの可能性もあり (https://www.fukushi.metro.tokyo.lg.jp/shinsho/teate/toku_shou.html で国の制度を照会しているが同居特別障害者の記載はない)

        寡婦控除 = 対象人物("寡婦控除", 対象期間)
        ひとり親控除 = 対象人物("ひとり親控除", 対象期間)
        勤労学生控除 = 対象人物("勤労学生控除", 対象期間)

        # 他の控除（雑損控除・医療費控除等）は定額でなく実費を元に算出するため除外する
        控除総額 = 給与所得及び雑所得からの控除額 + 社会保険料控除 + 配偶者特別控除 + 障害者控除 + 寡婦控除 + ひとり親控除 + 勤労学生控除
        控除後所得 = 対象となる所得 - 控除総額

        return 控除後所得 <= 所得制限限度額
\`\`\`

\`\`\`python
"""
精神障害者保健福祉手帳の実装
"""

from openfisca_core.indexed_enums import Enum
from openfisca_core.periods import DAY
from openfisca_core.variables import Variable
from openfisca_japan.entities import 人物


class 精神障害者保健福祉手帳等級パターン(Enum):
    __order__ = "無 一級 二級 三級"
    無 = "無"
    一級 = "一級"
    二級 = "二級"
    三級 = "三級"


class 精神障害者保健福祉手帳等級(Variable):
    value_type = Enum
    possible_values = 精神障害者保健福祉手帳等級パターン
    default_value = 精神障害者保健福祉手帳等級パターン.無
    entity = 人物
    definition_period = DAY
    label = "人物の精神障害者保健福祉手帳の等級"
\`\`\`

\`\`\`python
"""
療育手帳の実装

（知的障害者を対象とする手帳。東京都などでは「愛の手帳」の名称だが等級が異なる）
"""

from openfisca_core.indexed_enums import Enum
from openfisca_core.periods import DAY
from openfisca_core.variables import Variable
from openfisca_japan.entities import 人物


class 療育手帳等級パターン(Enum):
    __order__ = "無 A B"
    無 = "無"
    A = "A"
    B = "B"


class 療育手帳等級(Variable):
    value_type = Enum
    possible_values = 療育手帳等級パターン
    default_value = 療育手帳等級パターン.無
    entity = 人物
    definition_period = DAY
    label = "人物の療育手帳の等級"
\`\`\`

\`\`\`python
"""
愛の手帳の実装

（知的障害者を対象とする手帳。東京都など以外では「療育手帳」の名称だが等級が異なる）
"""

from openfisca_core.indexed_enums import Enum
from openfisca_core.periods import DAY
from openfisca_core.variables import Variable
from openfisca_japan.entities import 人物


class 愛の手帳等級パターン(Enum):
    __order__ = "無 一度 二度 三度 四度"
    無 = "無"
    一度 = "一度"
    二度 = "二度"
    三度 = "三度"
    四度 = "四度"


class 愛の手帳等級(Variable):
    value_type = Enum
    possible_values = 愛の手帳等級パターン
    default_value = 愛の手帳等級パターン.無
    entity = 人物
    definition_period = DAY
    label = "人物の愛の手帳の等級"
\`\`\`

\`\`\`python
"""
身体障害者手帳の実装
"""
from openfisca_core.indexed_enums import Enum
from openfisca_core.periods import DAY
from openfisca_core.variables import Variable
from openfisca_japan.entities import 人物


class 身体障害者手帳等級パターン(Enum):
    __order__ = "無 一級 二級 三級 四級 五級 六級 七級"
    無 = "無"
    一級 = "一級"
    二級 = "二級"
    三級 = "三級"
    四級 = "四級"
    五級 = "五級"
    六級 = "六級"
    七級 = "七級"


class 身体障害者手帳等級(Variable):
    value_type = Enum
    possible_values = 身体障害者手帳等級パターン
    default_value = 身体障害者手帳等級パターン.無
    entity = 人物
    definition_period = DAY
    label = "人物の身体障害者手帳等級"

    # NOTE: 交付年月日・有効期間は考慮しない
\`\`\`

\`\`\`python
"""
内部障害の実装
"""

from openfisca_core.indexed_enums import Enum
from openfisca_core.periods import DAY
from openfisca_core.variables import Variable
from openfisca_japan.entities import 人物


class 内部障害パターン(Enum):
    __order__ = "無 有"
    無 = "無"
    有 = "有"


class 内部障害(Variable):
    value_type = Enum
    possible_values = 内部障害パターン
    default_value = 内部障害パターン.無
    entity = 人物
    definition_period = DAY
    label = "人物の内部障害パターン"
\`\`\`

\`\`\`python
"""
脳性まひ_進行性筋萎縮症の実装
"""

from openfisca_core.indexed_enums import Enum
from openfisca_core.periods import DAY
from openfisca_core.variables import Variable
from openfisca_japan.entities import 人物


class 脳性まひ_進行性筋萎縮症パターン(Enum):
    __order__ = "無 有"
    無 = "無"
    有 = "有"


class 脳性まひ_進行性筋萎縮症(Variable):
    value_type = Enum
    possible_values = 脳性まひ_進行性筋萎縮症パターン
    default_value = 脳性まひ_進行性筋萎縮症パターン.無
    entity = 人物
    definition_period = DAY
    label = "人物の脳性まひ・進行性筋萎縮症パターン"
\`\`\`

\`\`\`python
"""
This file defines variables for the modelled legislation.

A variable is a property of an Entity such as a 人物, a 世帯…

See https://openfisca.org/doc/key-concepts/variables.html
"""

import numpy as np
# Import from openfisca-core the Python objects used to code the legislation in OpenFisca
from openfisca_core.holders import set_input_divide_by_period
from openfisca_core.periods import DAY
from openfisca_core.variables import Variable
# Import the Entities specifically defined for this tax and benefit system
from openfisca_japan.entities import 世帯, 人物


class 所得(Variable):
    # NOTE: 手当によって障害者控除や寡婦控除等の額を差し引く必要があるが、世帯情報が必要なため未実装
    value_type = float
    entity = 人物
    # NOTE: 所得自体は1年ごとに定義されるが、特定の日付における各種手当に計算できるように DAY で定義
    definition_period = DAY
    # Optional attribute. Allows user to declare a 所得 for a year.
    # OpenFisca will spread the yearly 金額 over the days contained in the year.
    set_input = set_input_divide_by_period
    label = "人物の所得"

    def formula(対象人物, 対象期間, _parameters):
        # NOTE: 収入660万円未満の場合給与所得控除額ではなく「所得税法別表第五」から算出するため、実際の所得と最大1000円程度誤差が発生する
        # https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1410.htm
        収入 = 対象人物("収入", 対象期間)
        給与所得控除額 = 対象人物("給与所得控除額", 対象期間)
        # 負の数にならないよう、0円未満になった場合は0円に補正
        return np.clip(収入 - 給与所得控除額, 0.0, None)


class 収入(Variable):
    value_type = float
    entity = 人物
    # 年間収入を指す
    # NOTE: 収入自体は1年ごとに定義されるが、特定の日付における各種手当に計算できるように DAY で定義
    definition_period = DAY
    # Optional attribute. Allows user to declare this variable for a year.
    # OpenFisca will spread the yearly 金額 over the days contained in the year.
    set_input = set_input_divide_by_period
    label = "人物の収入"


class 世帯所得(Variable):
    value_type = float
    entity = 世帯
    definition_period = DAY
    label = "世帯全員の収入の合計"

    def formula(対象世帯, 対象期間, _parameters):
        各収入 = 対象世帯.members("所得", 対象期間)
        return 対象世帯.sum(各収入)


class 世帯高所得(Variable):
    value_type = float
    entity = 世帯
    definition_period = DAY
    label = "世帯で最も所得が高い人物の所得"

    def formula(対象世帯, 対象期間, _parameters):
        所得一覧 = 対象世帯.members("所得", 対象期間)
        return 対象世帯.max(所得一覧)
\`\`\`

\`\`\`python
"""
This file defines variables for the modelled legislation.

A variable is a property of an Entity such as a 人物, a 世帯…

See https://openfisca.org/doc/key-concepts/variables.html
"""

# from cProfile import label
# from xmlrpc.client import Boolean
from datetime import date

# Import from numpy the operations you need to apply on OpenFisca"s population vectors
# Import from openfisca-core the Python objects used to code the legislation in OpenFisca
import numpy as np
from numpy import where
from openfisca_core.periods import DAY, ETERNITY
from openfisca_core.variables import Variable
# Import the Entities specifically defined for this tax and benefit system
from openfisca_japan.entities import 世帯, 人物


# This variable is a pure input: it doesn"t have a formula
class 誕生年月日(Variable):
    value_type = date
    default_value = date(1970, 1, 1)  # By default, if no value is set for a simulation, we consider the people involved in a simulation to be born on the 1st of Jan 1970.
    entity = 人物
    label = "人物の誕生年月日"
    definition_period = ETERNITY  # This variable cannot change over time.
    reference = "https://en.wiktionary.org/wiki/birthdate"


class 年齢(Variable):
    value_type = int
    entity = 人物
    definition_period = DAY
    label = "人物の年齢"

    def formula(対象人物, 対象期間, _parameters):
        誕生年月日 = 対象人物("誕生年月日", 対象期間)
        誕生年 = 誕生年月日.astype("datetime64[Y]").astype(int) + 1970
        誕生月 = 誕生年月日.astype("datetime64[M]").astype(int) % 12 + 1
        誕生日 = (誕生年月日 - 誕生年月日.astype("datetime64[M]") + 1).astype(int)

        誕生日を過ぎている = (誕生月 < 対象期間.start.month) + (誕生月 == 対象期間.start.month) * (誕生日 <= 対象期間.start.day)

        年齢 = (対象期間.start.year - 誕生年) - where(誕生日を過ぎている, 0, 1)  # If the birthday is not passed this year, subtract one year

        # NOTE: 誕生日が未来であった場合便宜上0歳として扱う(誤った情報が指定された場合でもOpenFiscaがクラッシュするのを防ぐため)
        return np.clip(年齢, 0, None)


# 小学n年生はn, 中学m年生はm+6, 高校l年生はl+9,
# 小学生未満は0以下の整数, 高校3年生より大きい学年は13以上の整数を返す
class 学年(Variable):
    value_type = int
    entity = 人物
    definition_period = DAY
    label = "人物の学年"

    def formula(対象人物, 対象期間, _parameters):
        誕生年月日 = 対象人物("誕生年月日", 対象期間)

        誕生年 = 誕生年月日.astype("datetime64[Y]").astype(int) + 1970
        誕生月 = 誕生年月日.astype("datetime64[M]").astype(int) % 12 + 1
        誕生日 = (誕生年月日 - 誕生年月日.astype("datetime64[M]") + 1).astype(int)

        # 早生まれは誕生月日が1/1~4/1
        早生まれ = (誕生月 < 4) + ((誕生月 == 4) * (誕生日 == 1))
        対象期間が四月以降 = 対象期間.start.month >= 4
        繰り上げ年数 = where(早生まれ, 1, 0) + where(対象期間が四月以降, 1, 0)

        return (対象期間.start.year - 誕生年) + 繰り上げ年数 - 7


class 世帯人数(Variable):
    value_type = int
    entity = 世帯
    definition_period = DAY
    label = "世帯人数"

    def formula(対象世帯, 対象期間, parameters):
        # NOTE: OpenFiscaの以下のメソッドで直接計算可能だが、テストのinputで人数を直接指定できるようVariable化
        return 対象世帯.nb_persons()
\`\`\`

\`\`\`python
"""
預貯金の実装
"""

from openfisca_core.periods import DAY
from openfisca_core.variables import Variable
from openfisca_japan.entities import 世帯, 人物


class 預貯金(Variable):
    value_type = int
    default_value = 0
    entity = 人物
    definition_period = DAY
    label = "預貯金"
    reference = "https://www.fukushi.metro.tokyo.lg.jp/seikatsu/teisyotokusyataisaku/jukenseichallenge.html"


class 子供の預貯金(Variable):
    value_type = int
    default_value = 0
    entity = 世帯
    definition_period = DAY
    label = "子供の預貯金"
    reference = "https://www.fukushi.metro.tokyo.lg.jp/seikatsu/teisyotokusyataisaku/jukenseichallenge.html"

    def formula(対象世帯, 対象期間, parameters):
        if 対象世帯.nb_persons(世帯.子) == 0:
            return 0

        子供である = 対象世帯.has_role(世帯.子)
        預貯金一覧 = 対象世帯.members("預貯金", 対象期間)
        return 対象世帯.sum(子供である * 預貯金一覧)
\`\`\`

\`\`\`python
"""
This file defines variables for the modelled legislation.

A variable is a property of an Entity such as a 人物, a 世帯…

See https://openfisca.org/doc/key-concepts/variables.html
"""

from functools import cache
import json

import numpy as np
# Import from openfisca-core the Python objects used to code the legislation in OpenFisca
from openfisca_core.periods import DAY
from openfisca_core.variables import Variable
# Import the Entities specifically defined for this tax and benefit system
from openfisca_japan.entities import 世帯


@cache
def 市区町村級地区分_キー一覧():
    """
    jsonファイルからキーを取得

    各要素は [都道府県名, 市区町村名] の形式
    """
    with open("openfisca_japan/assets/市区町村級地区分.json") as f:
        d = json.load(f)
        キー一覧 = []
        for 都道府県名, 都道府県データ in d.items():
            for 市区町村名 in 都道府県データ.keys():
                キー一覧.append([都道府県名, 市区町村名])
        return np.array(キー一覧)


@cache
def 市区町村級地区分_値一覧():
    """
    jsonファイルから値を取得

    市区町村級地区分_値一覧[市区町村級地区分キー, 区分]の形式で取得可能
    """
    with open("openfisca_japan/assets/市区町村級地区分.json") as f:
        d = json.load(f)
        値一覧 = []
        for 都道府県データ in d.values():
            for 市区町村データ in 都道府県データ.values():
                値一覧.append(市区町村データ)
        return np.array(値一覧)


class 居住都道府県(Variable):
    value_type = str
    entity = 世帯
    label = "居住都道府県"
    definition_period = DAY
    default_value = "北海道"


class 居住市区町村(Variable):
    value_type = str
    entity = 世帯
    label = "居住市区町村"
    definition_period = DAY
    default_value = "その他"


class 居住級地区分1(Variable):
    # m級地-n のとき m を返す
    value_type = int
    entity = 世帯
    label = "居住級地区分1"
    definition_period = DAY
    reference = "https://best-selection.co.jp/media/wp-content/uploads/2021/03/seikatsuhogo-kyuchi2022.pdf"

    def formula(対象世帯, 対象期間, _parameters):
        居住都道府県 = 対象世帯("居住都道府県", 対象期間)
        居住市区町村 = 対象世帯("居住市区町村", 対象期間)

        級地区分キー一覧 = 市区町村級地区分_キー一覧()
        級地区分インデックス = np.select(
            [(居住都道府県 == キー[0]) * (居住市区町村 == キー[1]) for キー in 級地区分キー一覧],
            list(range(len(級地区分キー一覧))),
            -1).astype(int)

        # NOTE: 市区町村級地区分()[級地区分インデックス, 0] が級地区分1を表す
        区分 = 市区町村級地区分_値一覧()[級地区分インデックス, 0]

        # 当てはまらない場合は3
        return np.select([級地区分インデックス != -1],
                         [区分],
                         3)


class 居住級地区分2(Variable):
    # m級地-n のとき n を返す
    value_type = int
    entity = 世帯
    label = "居住級地区分2"
    definition_period = DAY
    reference = "https://best-selection.co.jp/media/wp-content/uploads/2021/03/seikatsuhogo-kyuchi2022.pdf"

    def formula(対象世帯, 対象期間, parameters):
        居住都道府県 = 対象世帯("居住都道府県", 対象期間)
        居住市区町村 = 対象世帯("居住市区町村", 対象期間)

        級地区分キー一覧 = 市区町村級地区分_キー一覧()
        級地区分インデックス = np.select(
            [(居住都道府県 == キー[0]) * (居住市区町村 == キー[1]) for キー in 級地区分キー一覧],
            list(range(len(級地区分キー一覧))),
            -1).astype(int)

        # NOTE: 市区町村級地区分()[級地区分インデックス, 1] が級地区分2を表す
        区分 = 市区町村級地区分_値一覧()[級地区分インデックス, 1]

        # 当てはまらない場合は2
        return np.select(
            [級地区分インデックス != -1],
            [区分],
            2)
\`\`\`
`
